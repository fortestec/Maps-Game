import * as THREE from 'three';

function createVehicleShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.49
  );
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
  grad.addColorStop(0.6, 'rgba(2, 6, 23, 0.34)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildWheelMesh(
  radius: number,
  width: number,
  tireMat: THREE.Material,
  rimMat: THREE.Material,
  disposables: { dispose: () => void }[]
): THREE.Group {
  const group = new THREE.Group();

  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.castShadow = true;
  group.add(tire);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.012, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  group.add(rim);

  // Visual spokes so wheel rotation reads clearly
  const spokeGeo = new THREE.BoxGeometry(width + 0.02, radius * 1.12, radius * 0.14);
  const spoke1 = new THREE.Mesh(spokeGeo, rimMat);
  const spoke2 = new THREE.Mesh(spokeGeo, rimMat);
  spoke2.rotation.x = Math.PI / 2;
  group.add(spoke1, spoke2);

  disposables.push(tireGeo, rimGeo, spokeGeo);
  return group;
}

// ============================================================================
// MOTORCYCLE RIG
// ============================================================================

export interface MotoRig {
  root: THREE.Group;
  leanPivot: THREE.Group;
  steeringPivot: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  riderGroup: THREE.Group;
  rearBodyGroup: THREE.Group;
  brakeMat: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
  dispose: () => void;
}

export interface VehicleAnimState {
  wheelSpin: number;
  leanAngle: number;
  steerAngle: number;
  pitchAngle: number;
}

export function createMotoRig(): MotoRig {
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const fairingMat = new THREE.MeshStandardMaterial({
    color: 0xf97316, // Sporty street orange
    roughness: 0.24,
    metalness: 0.52,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.5,
    metalness: 0.55,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.9,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.88,
    metalness: 0.04,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.05,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: new THREE.Color(0xfef08a),
    emissiveIntensity: 1.5,
    roughness: 0.15,
    metalness: 0.1,
  });
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.2,
  });
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: new THREE.Color(0x0284c7),
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.2,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    roughness: 0.08,
    metalness: 0.85,
  });
  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.08,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.2,
    metalness: 0.35,
  });

  disposables.push(
    fairingMat,
    frameMat,
    chromeMat,
    tireMat,
    seatMat,
    headlightMat,
    brakeMat,
    dashMat,
    visorMat,
    jacketMat,
    helmetMat
  );

  // Contact shadow
  const shadowTex = createVehicleShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(1.1, 2.25);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.82,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  root.add(contactShadow);
  disposables.push(shadowTex, shadowGeo, shadowMat);

  // Lean pivot grounded at y = 0 so bike leans around tire contact patch
  const leanPivot = new THREE.Group();
  root.add(leanPivot);

  const wheelRadius = 0.31;
  const rearWheel = buildWheelMesh(wheelRadius, 0.16, tireMat, chromeMat, disposables);
  rearWheel.position.set(0, wheelRadius, 0.72);
  leanPivot.add(rearWheel);

  // Rear body & chassis (hidden in 1st person so only front cockpit/handlebars show)
  const rearBodyGroup = new THREE.Group();
  leanPivot.add(rearBodyGroup);

  const engineGeo = new THREE.BoxGeometry(0.32, 0.34, 0.56);
  const engine = new THREE.Mesh(engineGeo, frameMat);
  engine.position.set(0, 0.48, 0.06);
  engine.castShadow = true;
  rearBodyGroup.add(engine);

  const tankGeo = new THREE.BoxGeometry(0.34, 0.24, 0.54);
  const tank = new THREE.Mesh(tankGeo, fairingMat);
  tank.position.set(0, 0.8, -0.14);
  tank.rotation.x = 0.14;
  tank.castShadow = true;
  rearBodyGroup.add(tank);

  const seatGeo = new THREE.BoxGeometry(0.28, 0.11, 0.58);
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.set(0, 0.77, 0.36);
  seat.rotation.x = -0.06;
  rearBodyGroup.add(seat);

  const tailGeo = new THREE.BoxGeometry(0.24, 0.14, 0.42);
  const tail = new THREE.Mesh(tailGeo, fairingMat);
  tail.position.set(0, 0.84, 0.78);
  tail.rotation.x = -0.24;
  tail.castShadow = true;
  rearBodyGroup.add(tail);

  const tailLightGeo = new THREE.BoxGeometry(0.16, 0.05, 0.04);
  const tailLight = new THREE.Mesh(tailLightGeo, brakeMat);
  tailLight.position.set(0, 0.87, 0.99);
  rearBodyGroup.add(tailLight);

  // Twin chrome exhausts
  const exhaustGeo = new THREE.CylinderGeometry(0.042, 0.052, 0.75, 10);
  exhaustGeo.rotateX(Math.PI / 2);
  const exL = new THREE.Mesh(exhaustGeo, chromeMat);
  exL.position.set(-0.2, 0.38, 0.55);
  exL.rotation.x = -0.14;
  const exR = exL.clone();
  exR.position.x = 0.2;
  rearBodyGroup.add(exL, exR);

  // Swingarm
  const swingGeo = new THREE.BoxGeometry(0.24, 0.07, 0.65);
  const swing = new THREE.Mesh(swingGeo, frameMat);
  swing.position.set(0, 0.34, 0.42);
  rearBodyGroup.add(swing);

  disposables.push(engineGeo, tankGeo, seatGeo, tailGeo, tailLightGeo, exhaustGeo, swingGeo);

  // Front Steering Assembly (forks, front wheel, fairing nose, handlebars, digital dash)
  const steeringPivot = new THREE.Group();
  steeringPivot.position.set(0, 0.86, -0.44);
  leanPivot.add(steeringPivot);

  const frontWheel = buildWheelMesh(wheelRadius, 0.13, tireMat, chromeMat, disposables);
  frontWheel.position.set(0, wheelRadius - 0.86, -0.32);
  steeringPivot.add(frontWheel);

  const forkGeo = new THREE.CylinderGeometry(0.026, 0.024, 0.66, 10);
  const forkL = new THREE.Mesh(forkGeo, chromeMat);
  forkL.position.set(-0.11, -0.27, -0.16);
  forkL.rotation.x = 0.36;
  const forkR = forkL.clone();
  forkR.position.x = 0.11;
  steeringPivot.add(forkL, forkR);

  const noseGeo = new THREE.BoxGeometry(0.32, 0.22, 0.32);
  const nose = new THREE.Mesh(noseGeo, fairingMat);
  nose.position.set(0, 0.04, -0.18);
  nose.rotation.x = 0.2;
  steeringPivot.add(nose);

  const headlightGeo = new THREE.BoxGeometry(0.2, 0.08, 0.04);
  const headlight = new THREE.Mesh(headlightGeo, headlightMat);
  headlight.position.set(0, 0.03, -0.34);
  steeringPivot.add(headlight);

  // Windscreen + Digital Speedo Dash
  const screenGeo = new THREE.BoxGeometry(0.26, 0.22, 0.02);
  const screen = new THREE.Mesh(screenGeo, visorMat);
  screen.position.set(0, 0.21, -0.16);
  screen.rotation.x = -0.55;
  steeringPivot.add(screen);

  const dashGeo = new THREE.BoxGeometry(0.16, 0.075, 0.025);
  const dash = new THREE.Mesh(dashGeo, dashMat);
  dash.position.set(0, 0.14, -0.09);
  dash.rotation.x = -0.45;
  steeringPivot.add(dash);

  // Handlebars + Grips + Mirrors
  const barGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.66, 10);
  barGeo.rotateZ(Math.PI / 2);
  const bar = new THREE.Mesh(barGeo, chromeMat);
  bar.position.set(0, 0.12, 0.0);
  steeringPivot.add(bar);

  const gripGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10);
  gripGeo.rotateZ(Math.PI / 2);
  const gripL = new THREE.Mesh(gripGeo, seatMat);
  gripL.position.set(-0.29, 0.12, 0.02);
  gripL.rotation.y = 0.16;
  const gripR = gripL.clone();
  gripR.position.x = 0.29;
  gripR.rotation.y = -0.16;
  steeringPivot.add(gripL, gripR);

  const mirrorGeo = new THREE.BoxGeometry(0.1, 0.05, 0.02);
  const mirL = new THREE.Mesh(mirrorGeo, frameMat);
  mirL.position.set(-0.24, 0.23, -0.06);
  const mirR = mirL.clone();
  mirR.position.x = 0.24;
  steeringPivot.add(mirL, mirR);

  disposables.push(forkGeo, noseGeo, headlightGeo, screenGeo, dashGeo, barGeo, gripGeo, mirrorGeo);

  // Rider Group (visible in 3rd person, hidden in 1st person)
  const riderGroup = new THREE.Group();
  leanPivot.add(riderGroup);

  const riderTorsoGeo = new THREE.BoxGeometry(0.32, 0.44, 0.2);
  const riderTorso = new THREE.Mesh(riderTorsoGeo, jacketMat);
  riderTorso.position.set(0, 1.05, 0.16);
  riderTorso.rotation.x = -0.46;
  riderTorso.castShadow = true;
  riderGroup.add(riderTorso);

  const helmetGeo = new THREE.SphereGeometry(0.145, 16, 12);
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.set(0, 1.38, 0.02);
  helmet.castShadow = true;
  riderGroup.add(helmet);

  const visorGeo = new THREE.BoxGeometry(0.22, 0.08, 0.14);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.37, -0.09);
  riderGroup.add(visor);

  const armGeo = new THREE.CylinderGeometry(0.044, 0.036, 0.42, 8);
  const armL = new THREE.Mesh(armGeo, jacketMat);
  armL.position.set(-0.22, 1.06, -0.12);
  armL.rotation.x = 1.05;
  armL.rotation.z = -0.15;
  const armR = new THREE.Mesh(armGeo, jacketMat);
  armR.position.set(0.22, 1.06, -0.12);
  armR.rotation.x = 1.05;
  armR.rotation.z = 0.15;
  riderGroup.add(armL, armR);

  const legGeo = new THREE.CylinderGeometry(0.062, 0.048, 0.46, 8);
  const legL = new THREE.Mesh(legGeo, frameMat);
  legL.position.set(-0.18, 0.64, 0.24);
  legL.rotation.x = 0.45;
  const legR = legL.clone();
  legR.position.x = 0.18;
  riderGroup.add(legL, legR);

  disposables.push(riderTorsoGeo, helmetGeo, visorGeo, armGeo, legGeo);

  return {
    root,
    leanPivot,
    steeringPivot,
    frontWheel,
    rearWheel,
    riderGroup,
    rearBodyGroup,
    brakeMat,
    contactShadow,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function updateMotoAnimation(
  rig: MotoRig,
  state: VehicleAnimState,
  dt: number,
  speedMps: number,
  moveDir: number, // -1, 0, 1
  turnInput: number, // -1..1
  isFirstPerson: boolean,
  isBraking: boolean
): void {
  // Spin wheels proportional to road speed
  const angularVel = (speedMps / 0.31) * (moveDir < 0 ? -1 : 1);
  state.wheelSpin += angularVel * dt;
  rig.frontWheel.rotation.x = -state.wheelSpin;
  rig.rearWheel.rotation.x = -state.wheelSpin;

  // Dynamic turn lean + handlebar steer
  const speedFactor = THREE.MathUtils.clamp(speedMps / 12, 0.25, 1.0);
  const targetLean = -turnInput * 0.36 * speedFactor;
  const targetSteer = -turnInput * 0.26;
  const targetPitch = moveDir > 0 ? 0.045 * speedFactor : isBraking ? -0.055 : 0;

  state.leanAngle = THREE.MathUtils.damp(state.leanAngle, targetLean, 9, dt);
  state.steerAngle = THREE.MathUtils.damp(state.steerAngle, targetSteer, 12, dt);
  state.pitchAngle = THREE.MathUtils.damp(state.pitchAngle, targetPitch, 8, dt);

  rig.leanPivot.rotation.z = state.leanAngle;
  rig.leanPivot.rotation.x = state.pitchAngle;
  rig.steeringPivot.rotation.y = state.steerAngle;

  // First-person hides rider & rear tail so camera sits cleanly behind handlebars/dash
  rig.riderGroup.visible = !isFirstPerson;
  rig.rearBodyGroup.visible = !isFirstPerson;
  rig.contactShadow.visible = !isFirstPerson;

  rig.brakeMat.emissiveIntensity = isBraking ? 2.4 : 0.65;
}

// ============================================================================
// CAR RIG
// ============================================================================

export interface CarRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  exteriorCabinGroup: THREE.Group;
  steeringWheel: THREE.Group;
  flSteer: THREE.Group;
  frSteer: THREE.Group;
  wheels: THREE.Group[];
  brakeMat: THREE.MeshStandardMaterial;
  contactShadow: THREE.Mesh;
  dispose: () => void;
}

export function createCarRig(): CarRig {
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const paintMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Metallic urban sky-blue coupe
    roughness: 0.22,
    metalness: 0.68,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.72,
    metalness: 0.18,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.88,
    metalness: 0.05,
  });
  const alloyMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.2,
    metalness: 0.88,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.08,
    metalness: 0.3,
    transparent: true,
    opacity: 0.72,
  });
  const dashMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.65,
    metalness: 0.1,
  });
  const clusterMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: new THREE.Color(0x0ea5e9),
    emissiveIntensity: 1.2,
    roughness: 0.2,
    metalness: 0.1,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfefce8,
    emissive: new THREE.Color(0xfef9c3),
    emissiveIntensity: 1.6,
    roughness: 0.15,
    metalness: 0.1,
  });
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: new THREE.Color(0xef4444),
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0.2,
  });

  disposables.push(
    paintMat,
    trimMat,
    tireMat,
    alloyMat,
    glassMat,
    dashMat,
    clusterMat,
    headlightMat,
    brakeMat
  );

  // Ground contact shadow
  const shadowTex = createVehicleShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(2.35, 4.3);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  root.add(contactShadow);
  disposables.push(shadowTex, shadowGeo, shadowMat);

  // Wheels (radius 0.32m, grounded at y = 0)
  const wheelRadius = 0.32;
  const frontZ = -1.1;
  const rearZ = 1.06;
  const trackX = 0.78;

  const flSteer = new THREE.Group();
  flSteer.position.set(-trackX, wheelRadius, frontZ);
  const frSteer = new THREE.Group();
  frSteer.position.set(trackX, wheelRadius, frontZ);
  root.add(flSteer, frSteer);

  const flWheel = buildWheelMesh(wheelRadius, 0.22, tireMat, alloyMat, disposables);
  const frWheel = buildWheelMesh(wheelRadius, 0.22, tireMat, alloyMat, disposables);
  flSteer.add(flWheel);
  frSteer.add(frWheel);

  const rlWheel = buildWheelMesh(wheelRadius, 0.24, tireMat, alloyMat, disposables);
  rlWheel.position.set(-trackX, wheelRadius, rearZ);
  const rrWheel = buildWheelMesh(wheelRadius, 0.24, tireMat, alloyMat, disposables);
  rrWheel.position.set(trackX, wheelRadius, rearZ);
  root.add(rlWheel, rrWheel);

  // Suspended Car Body Pivot
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.36;
  root.add(bodyPivot);

  // Lower chassis / rocker body
  const chassisGeo = new THREE.BoxGeometry(1.64, 0.38, 3.45);
  const chassis = new THREE.Mesh(chassisGeo, paintMat);
  chassis.position.set(0, 0.14, 0);
  chassis.castShadow = true;
  bodyPivot.add(chassis);

  // Front hood & bumper
  const hoodGeo = new THREE.BoxGeometry(1.56, 0.16, 1.18);
  const hood = new THREE.Mesh(hoodGeo, paintMat);
  hood.position.set(0, 0.38, -1.1);
  hood.rotation.x = 0.07;
  hood.castShadow = true;
  bodyPivot.add(hood);

  const frontBumperGeo = new THREE.BoxGeometry(1.66, 0.22, 0.24);
  const frontBumper = new THREE.Mesh(frontBumperGeo, trimMat);
  frontBumper.position.set(0, 0.08, -1.68);
  bodyPivot.add(frontBumper);

  const rearBumperGeo = new THREE.BoxGeometry(1.66, 0.24, 0.24);
  const rearBumper = new THREE.Mesh(rearBumperGeo, trimMat);
  rearBumper.position.set(0, 0.09, 1.68);
  bodyPivot.add(rearBumper);

  // LED Headlights & Taillights
  const hlGeo = new THREE.BoxGeometry(0.32, 0.1, 0.06);
  const hlL = new THREE.Mesh(hlGeo, headlightMat);
  hlL.position.set(-0.56, 0.26, -1.73);
  const hlR = hlL.clone();
  hlR.position.x = 0.56;
  bodyPivot.add(hlL, hlR);

  const tlGeo = new THREE.BoxGeometry(0.38, 0.11, 0.06);
  const tlL = new THREE.Mesh(tlGeo, brakeMat);
  tlL.position.set(-0.54, 0.28, 1.73);
  const tlR = tlL.clone();
  tlR.position.x = 0.54;
  bodyPivot.add(tlL, tlR);

  disposables.push(chassisGeo, hoodGeo, frontBumperGeo, rearBumperGeo, hlGeo, tlGeo);

  // Exterior Cabin Greenhouse (visible in 3rd person; hidden in 1st person cockpit view)
  const exteriorCabinGroup = new THREE.Group();
  bodyPivot.add(exteriorCabinGroup);

  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.12, 0);
  cabinShape.lineTo(-0.54, 0.52);
  cabinShape.lineTo(0.68, 0.52);
  cabinShape.lineTo(1.24, 0);
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: 1.32,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.translate(-0.66, 0.34, 0.14);
  const cabinGlass = new THREE.Mesh(cabinGeo, glassMat);
  cabinGlass.castShadow = true;
  exteriorCabinGroup.add(cabinGlass);

  const roofGeo = new THREE.BoxGeometry(1.28, 0.07, 1.24);
  const roof = new THREE.Mesh(roofGeo, paintMat);
  roof.position.set(0, 0.86, 0.2);
  roof.castShadow = true;
  exteriorCabinGroup.add(roof);

  // Side mirrors + rear sport spoiler
  const mirrorGeo = new THREE.BoxGeometry(0.18, 0.09, 0.1);
  const mirrorL = new THREE.Mesh(mirrorGeo, trimMat);
  mirrorL.position.set(-0.88, 0.48, -0.52);
  const mirrorR = mirrorL.clone();
  mirrorR.position.x = 0.88;
  exteriorCabinGroup.add(mirrorL, mirrorR);

  const spoilerGeo = new THREE.BoxGeometry(1.42, 0.06, 0.22);
  const spoiler = new THREE.Mesh(spoilerGeo, trimMat);
  spoiler.position.set(0, 0.56, 1.56);
  exteriorCabinGroup.add(spoiler);

  disposables.push(cabinGeo, roofGeo, mirrorGeo, spoilerGeo);

  // Cockpit Dashboard & Steering Wheel (visible inside in 1st person!)
  const dashBoardGeo = new THREE.BoxGeometry(1.38, 0.22, 0.42);
  const dashBoard = new THREE.Mesh(dashBoardGeo, dashMat);
  dashBoard.position.set(0, 0.46, -0.55);
  bodyPivot.add(dashBoard);

  const clusterGeo = new THREE.BoxGeometry(0.36, 0.1, 0.04);
  const cluster = new THREE.Mesh(clusterGeo, clusterMat);
  cluster.position.set(0, 0.56, -0.45);
  cluster.rotation.x = -0.25;
  bodyPivot.add(cluster);

  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(0, 0.54, -0.32);
  steeringWheel.rotation.x = -0.35;
  bodyPivot.add(steeringWheel);

  const wheelRimGeo = new THREE.TorusGeometry(0.15, 0.022, 10, 24);
  const wheelRim = new THREE.Mesh(wheelRimGeo, trimMat);
  const wheelHubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12);
  wheelHubGeo.rotateX(Math.PI / 2);
  const wheelHub = new THREE.Mesh(wheelHubGeo, alloyMat);
  const wheelBarGeo = new THREE.BoxGeometry(0.28, 0.032, 0.022);
  const wheelBar = new THREE.Mesh(wheelBarGeo, trimMat);
  steeringWheel.add(wheelRim, wheelHub, wheelBar);

  disposables.push(dashBoardGeo, clusterGeo, wheelRimGeo, wheelHubGeo, wheelBarGeo);

  return {
    root,
    bodyPivot,
    exteriorCabinGroup,
    steeringWheel,
    flSteer,
    frSteer,
    wheels: [flWheel, frWheel, rlWheel, rrWheel],
    brakeMat,
    contactShadow,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function updateCarAnimation(
  rig: CarRig,
  state: VehicleAnimState,
  dt: number,
  speedMps: number,
  moveDir: number,
  turnInput: number,
  isFirstPerson: boolean,
  isBraking: boolean
): void {
  const angularVel = (speedMps / 0.32) * (moveDir < 0 ? -1 : 1);
  state.wheelSpin += angularVel * dt;
  for (const w of rig.wheels) {
    w.rotation.x = -state.wheelSpin;
  }

  const speedFactor = THREE.MathUtils.clamp(speedMps / 15, 0.2, 1.0);
  const targetSteer = -turnInput * 0.42;
  const targetRoll = turnInput * 0.06 * speedFactor;
  const targetPitch = moveDir > 0 ? 0.025 * speedFactor : isBraking ? -0.035 : 0;

  state.steerAngle = THREE.MathUtils.damp(state.steerAngle, targetSteer, 12, dt);
  state.leanAngle = THREE.MathUtils.damp(state.leanAngle, targetRoll, 8, dt);
  state.pitchAngle = THREE.MathUtils.damp(state.pitchAngle, targetPitch, 8, dt);

  rig.flSteer.rotation.y = state.steerAngle;
  rig.frSteer.rotation.y = state.steerAngle;
  rig.steeringWheel.rotation.z = state.steerAngle * 2.1;

  rig.bodyPivot.rotation.z = state.leanAngle;
  rig.bodyPivot.rotation.x = state.pitchAngle;

  // In 1st person, remove exterior cabin roof/pillars so camera looks over hood & dashboard
  rig.exteriorCabinGroup.visible = !isFirstPerson;
  rig.contactShadow.visible = !isFirstPerson;
  rig.brakeMat.emissiveIntensity = isBraking ? 2.6 : 0.7;
}
