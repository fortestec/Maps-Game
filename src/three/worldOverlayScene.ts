import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type {
  AdjacentLink,
  CameraMode,
  CollectibleToken,
  LatLngLiteral,
  RoutePlan,
  TransportMode,
} from '../types/game';
import { angleDiff, computeBearing, haversineDistance } from '../services/walkingEngine';
import { createWalkerCharacter, updateWalkerAnimation, type WalkerAnimState, type WalkerRig } from './walkerCharacter';
import {
  createCarRig,
  createMotoRig,
  updateCarAnimation,
  updateMotoAnimation,
  type CarRig,
  type MotoRig,
  type VehicleAnimState,
} from './vehicleRigs';

export interface OverlaySyncData {
  transportMode: TransportMode;
  cameraMode: CameraMode;
  playerPos: LatLngLiteral;
  heading: number;
  pitch: number;
  zoom: number;
  speedMetersPerSec: number;
  moveDir: number; // -1, 0, 1
  isMoving: boolean;
  isJogging: boolean;
  isBraking: boolean;
  turnInput: number;
  tokens: CollectibleToken[];
  links: AdjacentLink[];
  activeRoute: RoutePlan | null;
}

interface DustParticle {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
}

// Reusable math objects (zero GC inside animation loop)
const _vec3 = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _camGoal = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class WorldOverlayScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private pmremEnv: THREE.Texture | null = null;

  private walker: WalkerRig;
  private moto: MotoRig;
  private car: CarRig;

  private walkerAnim: WalkerAnimState = {
    phase: 0,
    prevSin: 0,
    blendMove: 0,
    turnBank: 0,
  };
  private motoAnim: VehicleAnimState = {
    wheelSpin: 0,
    leanAngle: 0,
    steerAngle: 0,
    pitchAngle: 0,
  };
  private carAnim: VehicleAnimState = {
    wheelSpin: 0,
    leanAngle: 0,
    steerAngle: 0,
    pitchAngle: 0,
  };
  private tireDustTimer = 0;

  // Virtual street guide ring at player feet
  private compassRingGroup: THREE.Group;
  private linkChevrons: THREE.Mesh[] = [];
  private tokenMeshes: { mesh: THREE.Group; ring: THREE.Mesh; core: THREE.Mesh }[] = [];
  private waypointBeacon: THREE.Group;
  private dustPool: DustParticle[] = [];

  // Smooth camera transition state
  private currentCamDist = 3.1;
  private currentCamHeight = 1.95;
  private currentShoulderOffset = 0.25;
  private walkerVisualHeading = 0;

  private disposableGeos: THREE.BufferGeometry[] = [];
  private disposableMats: THREE.Material[] = [];

  private syncData: OverlaySyncData = {
    transportMode: 'walk',
    cameraMode: 'third_person',
    playerPos: { lat: 0, lng: 0 },
    heading: 0,
    pitch: 0,
    zoom: 1,
    speedMetersPerSec: 0,
    moveDir: 0,
    isMoving: false,
    isJogging: false,
    isBraking: false,
    turnInput: 0,
    tokens: [],
    links: [],
    activeRoute: null,
  };

  private onFootstepCallback: (isJogging: boolean) => void;
  private clock = new THREE.Clock();
  private animFrameId = 0;
  private disposed = false;

  constructor(container: HTMLElement, onFootstep: (isJogging: boolean) => void) {
    this.container = container;
    this.onFootstepCallback = onFootstep;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Studio IBL environment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmremEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.pmremEnv;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 220);

    // Warm/Cool 3-point outdoor lighting rig
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.1);
    keyLight.position.set(8, 16, 10);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 35;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x334155, 0.95);
    this.scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    rimLight.position.set(-6, 5, -8);
    this.scene.add(rimLight);

    // Build 3D Walker, Motorcycle & Car rigs
    this.walker = createWalkerCharacter();
    this.moto = createMotoRig();
    this.car = createCarRig();
    this.moto.root.visible = false;
    this.car.root.visible = false;
    this.scene.add(this.walker.root, this.moto.root, this.car.root);

    // Build Street Ground Ring + Directional Link Chevrons
    this.compassRingGroup = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.55, 0.62, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.02;
    this.compassRingGroup.add(ringMesh);
    this.scene.add(this.compassRingGroup);
    this.disposableGeos.push(ringGeo);
    this.disposableMats.push(ringMat);

    // Pre-allocate up to 6 street link chevron arrows
    const chevShape = new THREE.Shape();
    chevShape.moveTo(0, 0.36);
    chevShape.lineTo(0.24, -0.14);
    chevShape.lineTo(0, -0.02);
    chevShape.lineTo(-0.24, -0.14);
    chevShape.closePath();
    const chevGeo = new THREE.ExtrudeGeometry(chevShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 1,
    });
    chevGeo.rotateX(-Math.PI / 2);
    const chevMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.85,
      roughness: 0.25,
      metalness: 0.3,
    });
    this.disposableGeos.push(chevGeo);
    this.disposableMats.push(chevMat);

    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(chevGeo, chevMat);
      m.visible = false;
      this.scene.add(m);
      this.linkChevrons.push(m);
    }

    // Pre-allocate 6 Collectible Token 3D groups
    const tokenCoreGeo = new THREE.OctahedronGeometry(0.45, 0);
    const tokenRingGeo = new THREE.TorusGeometry(0.68, 0.055, 8, 24);
    const tokenCoreMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: new THREE.Color(0xf59e0b),
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.85,
    });
    const tokenRingMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xfbbf24),
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.7,
    });
    this.disposableGeos.push(tokenCoreGeo, tokenRingGeo);
    this.disposableMats.push(tokenCoreMat, tokenRingMat);

    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(tokenCoreGeo, tokenCoreMat);
      core.position.y = 1.45;
      const ring = new THREE.Mesh(tokenRingGeo, tokenRingMat);
      ring.position.y = 1.45;
      group.add(core, ring);
      group.visible = false;
      this.scene.add(group);
      this.tokenMeshes.push({ mesh: group, ring, core });
    }

    // Route Destination Beacon Pillar
    this.waypointBeacon = new THREE.Group();
    const beamGeo = new THREE.CylinderGeometry(0.28, 0.55, 18, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 9;
    const baseRingGeo = new THREE.RingGeometry(0.75, 1.05, 32);
    const baseRingMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.05;
    this.waypointBeacon.add(beam, baseRing);
    this.waypointBeacon.visible = false;
    this.scene.add(this.waypointBeacon);
    this.disposableGeos.push(beamGeo, baseRingGeo);
    this.disposableMats.push(beamMat, baseRingMat);

    // Pooled footstep dust particles (24 instances)
    const dustGeo = new THREE.SphereGeometry(0.06, 6, 6);
    this.disposableGeos.push(dustGeo);
    for (let i = 0; i < 24; i++) {
      const dustMat = new THREE.MeshBasicMaterial({
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      this.disposableMats.push(dustMat);
      const mesh = new THREE.Mesh(dustGeo, dustMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.dustPool.push({
        mesh,
        active: false,
        age: 0,
        life: 0.45,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.startLoop();
  }

  public updateSync(data: OverlaySyncData): void {
    this.syncData = data;
  }

  public spawnBurst(worldX: number, worldY: number, worldZ: number, colorHex = 0xfbbf24): void {
    let spawned = 0;
    for (const p of this.dustPool) {
      if (!p.active && spawned < 10) {
        p.active = true;
        p.age = 0;
        p.life = 0.55;
        const angle = (spawned / 10) * Math.PI * 2;
        p.vx = Math.cos(angle) * 2.2;
        p.vy = 1.4 + Math.random() * 1.4;
        p.vz = Math.sin(angle) * 2.2;
        p.mesh.position.set(worldX, worldY, worldZ);
        p.mesh.scale.setScalar(1.4);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(colorHex);
        mat.opacity = 0.85;
        p.mesh.visible = true;
        spawned++;
      }
    }
  }

  private spawnFootstepDust(side: -1 | 1): void {
    const yawRad = THREE.MathUtils.degToRad(this.walkerVisualHeading);
    const rightX = Math.cos(yawRad) * side * 0.13;
    const rightZ = Math.sin(yawRad) * side * 0.13;

    let spawned = 0;
    for (const p of this.dustPool) {
      if (!p.active && spawned < 2) {
        p.active = true;
        p.age = 0;
        p.life = 0.36;
        p.vx = (Math.random() - 0.5) * 0.45;
        p.vy = 0.35 + Math.random() * 0.35;
        p.vz = (Math.random() - 0.5) * 0.45;
        p.mesh.position.set(rightX, 0.05, rightZ);
        p.mesh.scale.setScalar(0.85);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(0xcbd5e1);
        mat.opacity = 0.4;
        p.mesh.visible = true;
        spawned++;
      }
    }
  }

  private spawnVehicleDust(offsetX: number, offsetZ: number): void {
    for (const p of this.dustPool) {
      if (!p.active) {
        p.active = true;
        p.age = 0;
        p.life = 0.42;
        p.vx = (Math.random() - 0.5) * 0.65;
        p.vy = 0.4 + Math.random() * 0.45;
        p.vz = (Math.random() - 0.5) * 0.65;
        p.mesh.position.set(offsetX + (Math.random() - 0.5) * 0.25, 0.14, offsetZ + (Math.random() - 0.5) * 0.25);
        p.mesh.scale.setScalar(1.1);
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(0x94a3b8);
        mat.opacity = 0.36;
        p.mesh.visible = true;
        break;
      }
    }
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.animFrameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.animFrameId = window.setTimeout(cb, 80);
      }
    };
    this.animFrameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = this.clock.elapsedTime;

      this.updateScene(dt, elapsed);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.animFrameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.animFrameId = window.setTimeout(tick, 16);
    } else {
      this.animFrameId = requestAnimationFrame(tick);
    }
  }

  private updateScene(dt: number, elapsed: number): void {
    const d = this.syncData;
    const isThird = d.cameraMode === 'third_person';
    const mode = d.transportMode;

    // Smooth camera mode interpolation tailored per transport mode
    let targetDist = 0.0;
    let targetHeight = 1.66;
    let targetShoulder = 0.0;

    if (mode === 'walk') {
      targetDist = isThird ? 3.15 : 0.0;
      targetHeight = isThird ? 1.98 : 1.66;
      targetShoulder = isThird ? 0.24 : 0.0;
    } else if (mode === 'moto') {
      targetDist = isThird ? 4.05 : -0.18;
      targetHeight = isThird ? 2.02 : 1.38;
      targetShoulder = isThird ? 0.14 : 0.0;
    } else {
      // car
      targetDist = isThird ? 5.35 : 0.08;
      targetHeight = isThird ? 2.38 : 1.24;
      targetShoulder = 0.0;
    }

    this.currentCamDist = THREE.MathUtils.damp(this.currentCamDist, targetDist, 9, dt);
    this.currentCamHeight = THREE.MathUtils.damp(this.currentCamHeight, targetHeight, 9, dt);
    this.currentShoulderOffset = THREE.MathUtils.damp(this.currentShoulderOffset, targetShoulder, 9, dt);

    // Smoothly align actor/vehicle facing to camera heading
    const headingDelta = angleDiff(d.heading, this.walkerVisualHeading);
    this.walkerVisualHeading += headingDelta * (1 - Math.exp(-12 * dt));
    const headingRad = THREE.MathUtils.degToRad(d.heading);
    const pitchRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(d.pitch, -55, 55));
    const visualYaw = -THREE.MathUtils.degToRad(this.walkerVisualHeading);

    // Show appropriate 3D rig
    this.walker.root.visible = mode === 'walk' && this.currentCamDist > 0.45;
    this.moto.root.visible = mode === 'moto';
    this.car.root.visible = mode === 'car';

    this.walker.root.rotation.y = visualYaw;
    this.moto.root.rotation.y = visualYaw;
    this.car.root.rotation.y = visualYaw;

    this.compassRingGroup.visible = isThird && this.currentCamDist > 0.45;
    const ringScale = mode === 'car' ? 2.3 : mode === 'moto' ? 1.55 : 1.0;
    this.compassRingGroup.scale.set(ringScale, 1, ringScale);

    if (mode === 'walk') {
      const speedNorm = d.isMoving ? (d.isJogging ? 1.0 : 0.56) : 0;
      updateWalkerAnimation(
        this.walker,
        this.walkerAnim,
        dt,
        elapsed,
        speedNorm,
        d.isJogging,
        d.turnInput,
        (side) => {
          if (this.walker.root.visible) {
            this.spawnFootstepDust(side);
          }
          this.onFootstepCallback(d.isJogging);
        }
      );
    } else if (mode === 'moto') {
      updateMotoAnimation(
        this.moto,
        this.motoAnim,
        dt,
        d.speedMetersPerSec,
        d.moveDir,
        d.turnInput,
        !isThird,
        d.isBraking
      );
      if (isThird && d.isMoving && d.speedMetersPerSec > 4) {
        this.tireDustTimer += dt;
        const dustInterval = d.speedMetersPerSec > 24 ? 0.055 : d.isJogging ? 0.08 : 0.14;
        if (this.tireDustTimer > dustInterval) {
          this.tireDustTimer = 0;
          const backX = Math.sin(THREE.MathUtils.degToRad(this.walkerVisualHeading)) * -0.95;
          const backZ = Math.cos(THREE.MathUtils.degToRad(this.walkerVisualHeading)) * 0.95;
          this.spawnVehicleDust(backX, backZ);
        }
      }
    } else {
      updateCarAnimation(
        this.car,
        this.carAnim,
        dt,
        d.speedMetersPerSec,
        d.moveDir,
        d.turnInput,
        !isThird,
        d.isBraking
      );
      if (isThird && d.isMoving && d.speedMetersPerSec > 5) {
        this.tireDustTimer += dt;
        const dustInterval = d.speedMetersPerSec > 28 ? 0.055 : d.isJogging ? 0.08 : 0.15;
        if (this.tireDustTimer > dustInterval) {
          this.tireDustTimer = 0;
          const backX = Math.sin(THREE.MathUtils.degToRad(this.walkerVisualHeading)) * -1.45;
          const backZ = Math.cos(THREE.MathUtils.degToRad(this.walkerVisualHeading)) * 1.45;
          this.spawnVehicleDust(backX, backZ);
        }
      }
    }

    // Sync FOV smoothly to Street View zoom (plus dynamic speed sensation on vehicles)
    const speedFovBoost =
      mode === 'walk' ? 0 : THREE.MathUtils.clamp(d.speedMetersPerSec * 0.34, 0, 14);
    const targetFov = THREE.MathUtils.clamp(
      78 / Math.pow(2, (d.zoom - 1) * 0.6) + speedFovBoost,
      34,
      102
    );
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 10, dt);
      this.camera.updateProjectionMatrix();
    }

    // Forward direction vector: North (0 deg) = -Z, East (90 deg) = +X
    const fwdX = Math.sin(headingRad) * Math.cos(pitchRad);
    const fwdY = Math.sin(pitchRad);
    const fwdZ = -Math.cos(headingRad) * Math.cos(pitchRad);

    // Right vector for slight over-the-shoulder offset in 3rd person
    const rightX = Math.cos(headingRad);
    const rightZ = Math.sin(headingRad);

    // Subtle motion vibration / head-bob
    const fpBob =
      !isThird && d.isMoving
        ? mode === 'walk'
          ? Math.sin(this.walkerAnim.phase * 2) * (d.isJogging ? 0.032 : 0.018)
          : Math.sin(elapsed * 28) * 0.004
        : 0;

    _camGoal.set(
      -fwdX * this.currentCamDist + rightX * this.currentShoulderOffset,
      this.currentCamHeight - fwdY * this.currentCamDist * 0.65 + fpBob,
      -fwdZ * this.currentCamDist + rightZ * this.currentShoulderOffset
    );
    _camGoal.y = Math.max(0.35, _camGoal.y);
    this.camera.position.copy(_camGoal);

    const lookBaseY = mode === 'car' ? 1.15 : mode === 'moto' ? 1.25 : 1.52;
    _lookTarget.set(
      fwdX * 12 + rightX * this.currentShoulderOffset * 0.4,
      lookBaseY + fwdY * 12,
      fwdZ * 12 + rightZ * this.currentShoulderOffset * 0.4
    );
    this.camera.lookAt(_lookTarget);

    // Position street link chevrons on the ground plane
    const links = d.links ?? [];
    for (let i = 0; i < this.linkChevrons.length; i++) {
      const mesh = this.linkChevrons[i];
      if (i < links.length) {
        const lRad = THREE.MathUtils.degToRad(links[i].heading);
        const radius = 3.2;
        mesh.position.set(Math.sin(lRad) * radius, 0.05, -Math.cos(lRad) * radius);
        mesh.rotation.y = -lRad;
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    }

    // Position 3D collectible tokens relative to player GPS
    for (let i = 0; i < this.tokenMeshes.length; i++) {
      const tEntry = this.tokenMeshes[i];
      const token = d.tokens[i];
      if (token && !token.collected) {
        const dist = haversineDistance(d.playerPos, token.position);
        if (dist <= 180) {
          const bearingRad = THREE.MathUtils.degToRad(
            computeBearing(d.playerPos, token.position)
          );
          // Scale visual distance smoothly so tokens within 180m stay crisp & legible in 3D
          const visualDist = Math.min(dist, 55);
          const wx = Math.sin(bearingRad) * visualDist;
          const wz = -Math.cos(bearingRad) * visualDist;
          tEntry.mesh.position.set(wx, 0, wz);
          tEntry.core.rotation.y = elapsed * 2.1 + i;
          tEntry.core.position.y = 1.45 + Math.sin(elapsed * 2.6 + i) * 0.16;
          tEntry.ring.rotation.x = Math.sin(elapsed * 1.4 + i) * 0.6;
          tEntry.ring.rotation.y = -elapsed * 1.5;
          tEntry.ring.position.y = tEntry.core.position.y;
          tEntry.mesh.visible = true;
        } else {
          tEntry.mesh.visible = false;
        }
      } else {
        tEntry.mesh.visible = false;
      }
    }

    // Position active route destination beacon
    if (d.activeRoute) {
      const destDist = haversineDistance(d.playerPos, d.activeRoute.destination);
      if (destDist <= 180) {
        const bRad = THREE.MathUtils.degToRad(
          computeBearing(d.playerPos, d.activeRoute.destination)
        );
        const vDist = Math.min(destDist, 70);
        this.waypointBeacon.position.set(Math.sin(bRad) * vDist, 0, -Math.cos(bRad) * vDist);
        this.waypointBeacon.visible = true;
      } else {
        this.waypointBeacon.visible = false;
      }
    } else {
      this.waypointBeacon.visible = false;
    }

    // Update pooled particles
    for (const p of this.dustPool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const progress = p.age / p.life;
      _vec3.set(p.vx * dt, p.vy * dt, p.vz * dt);
      p.mesh.position.add(_vec3);
      p.vy -= 2.8 * dt;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 * (1 - progress);
      p.mesh.scale.setScalar(0.8 + progress * 0.9);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    clearTimeout(this.animFrameId);
    window.removeEventListener('resize', this.handleResize);

    this.walker.dispose();
    this.moto.dispose();
    this.car.dispose();
    this.pmremEnv?.dispose();
    for (const g of this.disposableGeos) g.dispose();
    for (const m of this.disposableMats) m.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
