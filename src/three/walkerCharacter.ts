import * as THREE from 'three';

export interface WalkerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  contactShadow: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.48
  );
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.65)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.28)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a composite 12+ part procedural 3D explorer character grounded at y = 0.
 */
export function createWalkerCharacter(): WalkerRig {
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // PBR Materials with >= 0.25 roughness contrast between fabric, skin, metal, and visor
  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0xe85d35, // Vibrant explorer terracotta/coral
    roughness: 0.78,
    metalness: 0.04,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Slate denim
    roughness: 0.86,
    metalness: 0.02,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd9a07e,
    roughness: 0.52,
    metalness: 0.0,
  });
  const packMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a, // Deep tactical navy-slate
    roughness: 0.7,
    metalness: 0.12,
  });
  const hardwareMat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    roughness: 0.2,
    metalness: 0.88,
  });
  const shoeUpperMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.48,
    metalness: 0.05,
  });
  const shoeSoleMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.9,
    metalness: 0.0,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    roughness: 0.42,
    metalness: 0.1,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: new THREE.Color(0x38bdf8),
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.3,
  });

  disposables.push(
    jacketMat,
    pantsMat,
    skinMat,
    packMat,
    hardwareMat,
    shoeUpperMat,
    shoeSoleMat,
    capMat,
    beaconMat
  );

  // 1. Contact shadow decal at y = 0.01
  const shadowTex = createContactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(0.92, 0.92);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  contactShadow.renderOrder = 1;
  root.add(contactShadow);
  disposables.push(shadowTex, shadowGeo, shadowMat);

  // Body pivot centered at hip height (0.88m)
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.88;
  root.add(bodyPivot);

  // 2. Pelvis
  const pelvisGeo = new THREE.BoxGeometry(0.32, 0.14, 0.2);
  const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
  pelvis.castShadow = true;
  bodyPivot.add(pelvis);
  disposables.push(pelvisGeo);

  // 3. Sculpted Jacket Torso (ExtrudeGeometry with bevel)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.06;
  bodyPivot.add(torsoGroup);

  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-0.17, 0);
  torsoShape.lineTo(0.17, 0);
  torsoShape.lineTo(0.2, 0.42);
  torsoShape.lineTo(0.12, 0.48);
  torsoShape.lineTo(-0.12, 0.48);
  torsoShape.lineTo(-0.2, 0.42);
  torsoShape.closePath();

  const torsoGeo = new THREE.ExtrudeGeometry(torsoShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  torsoGeo.translate(0, 0, -0.09);
  const torsoMesh = new THREE.Mesh(torsoGeo, jacketMat);
  torsoMesh.castShadow = true;
  torsoGroup.add(torsoMesh);
  disposables.push(torsoGeo);

  // Collar + metallic zipper trim
  const collarGeo = new THREE.CylinderGeometry(0.085, 0.105, 0.08, 12);
  const collar = new THREE.Mesh(collarGeo, packMat);
  collar.position.set(0, 0.5, 0);
  torsoGroup.add(collar);
  disposables.push(collarGeo);

  // 4. Explorer Backpack + Rolled Mat + Metallic Buckle + GPS Beacon Strip
  const packGroup = new THREE.Group();
  packGroup.position.set(0, 0.26, 0.16);
  torsoGroup.add(packGroup);

  const packBodyGeo = new THREE.BoxGeometry(0.28, 0.36, 0.14);
  const packBody = new THREE.Mesh(packBodyGeo, packMat);
  packBody.castShadow = true;
  packGroup.add(packBody);

  const rollGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.3, 12);
  const roll = new THREE.Mesh(rollGeo, capMat);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.21, 0.0);
  roll.castShadow = true;
  packGroup.add(roll);

  const buckleGeo = new THREE.BoxGeometry(0.09, 0.04, 0.03);
  const buckle = new THREE.Mesh(buckleGeo, hardwareMat);
  buckle.position.set(0, 0.04, 0.075);
  packGroup.add(buckle);

  const beaconGeo = new THREE.BoxGeometry(0.2, 0.028, 0.02);
  const beaconStrip = new THREE.Mesh(beaconGeo, beaconMat);
  beaconStrip.position.set(0, -0.09, 0.075);
  packGroup.add(beaconStrip);
  disposables.push(packBodyGeo, rollGeo, buckleGeo, beaconGeo);

  // 5. Head, Cap, Visor & Headphones
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.54, 0);
  torsoGroup.add(headGroup);

  const neckGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.03;
  headGroup.add(neck);

  const headGeo = new THREE.SphereGeometry(0.125, 16, 14);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 0.17;
  head.castShadow = true;
  headGroup.add(head);

  // Explorer Cap dome + forward brim (facing -Z)
  const capDomeGeo = new THREE.SphereGeometry(
    0.132,
    16,
    10,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.52
  );
  const capDome = new THREE.Mesh(capDomeGeo, capMat);
  capDome.position.y = 0.18;
  capDome.rotation.x = -0.1;
  headGroup.add(capDome);

  const brimGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.018, 12, 1, false, -Math.PI * 0.4, Math.PI * 0.8);
  const brim = new THREE.Mesh(brimGeo, capMat);
  brim.position.set(0, 0.21, -0.09);
  brim.rotation.y = Math.PI;
  headGroup.add(brim);

  // Over-ear headphones band & earcups
  const bandGeo = new THREE.TorusGeometry(0.136, 0.015, 8, 16, Math.PI);
  const band = new THREE.Mesh(bandGeo, hardwareMat);
  band.position.y = 0.18;
  headGroup.add(band);

  const cupGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.03, 12);
  const leftCup = new THREE.Mesh(cupGeo, packMat);
  leftCup.rotation.z = Math.PI / 2;
  leftCup.position.set(-0.135, 0.17, 0);
  const rightCup = leftCup.clone();
  rightCup.position.x = 0.135;
  headGroup.add(leftCup, rightCup);
  disposables.push(neckGeo, headGeo, capDomeGeo, brimGeo, bandGeo, cupGeo);

  // 6. Articulated Arms (Shoulder -> Upper Arm -> Elbow -> Forearm -> Hand)
  const upperArmGeo = new THREE.CylinderGeometry(0.052, 0.044, 0.26, 10);
  const forearmGeo = new THREE.CylinderGeometry(0.042, 0.035, 0.24, 10);
  const handGeo = new THREE.SphereGeometry(0.042, 10, 8);
  disposables.push(upperArmGeo, forearmGeo, handGeo);

  function buildArm(side: -1 | 1): { shoulder: THREE.Group; elbow: THREE.Group } {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.25, 0.43, 0);
    torsoGroup.add(shoulder);

    const upperArm = new THREE.Mesh(upperArmGeo, jacketMat);
    upperArm.position.y = -0.12;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.25;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(forearmGeo, jacketMat);
    forearm.position.y = -0.11;
    forearm.castShadow = true;
    elbow.add(forearm);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.y = -0.24;
    elbow.add(hand);

    return { shoulder, elbow };
  }

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // 7. Articulated Legs (Hip -> Thigh -> Knee -> Shin -> Sneaker)
  const thighGeo = new THREE.CylinderGeometry(0.072, 0.058, 0.4, 12);
  const shinGeo = new THREE.CylinderGeometry(0.056, 0.044, 0.38, 12);
  const shoeBodyGeo = new THREE.BoxGeometry(0.11, 0.08, 0.22);
  const shoeSoleGeo = new THREE.BoxGeometry(0.116, 0.028, 0.23);
  disposables.push(thighGeo, shinGeo, shoeBodyGeo, shoeSoleGeo);

  function buildLeg(side: -1 | 1): { hip: THREE.Group; knee: THREE.Group } {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.05, 0);
    bodyPivot.add(hip);

    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.4;
    hip.add(knee);

    const shin = new THREE.Mesh(shinGeo, pantsMat);
    shin.position.y = -0.19;
    shin.castShadow = true;
    knee.add(shin);

    // Sneaker grounded so bottom of sole sits right at y = 0 in rest pose:
    // 0.88 - 0.05 - 0.40 - 0.38 - 0.05 = 0.00!
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(0, -0.39, -0.035);
    knee.add(shoeGroup);

    const shoeBody = new THREE.Mesh(shoeBodyGeo, shoeUpperMat);
    shoeBody.position.y = 0.015;
    shoeBody.castShadow = true;
    shoeGroup.add(shoeBody);

    const shoeSole = new THREE.Mesh(shoeSoleGeo, shoeSoleMat);
    shoeSole.position.y = -0.026;
    shoeGroup.add(shoeSole);

    return { hip, knee };
  }

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  return {
    root,
    bodyPivot,
    torsoGroup,
    headGroup,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    contactShadow,
    beaconMat,
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}

export interface WalkerAnimState {
  phase: number;
  prevSin: number;
  blendMove: number;
  turnBank: number;
}

export function updateWalkerAnimation(
  rig: WalkerRig,
  state: WalkerAnimState,
  dt: number,
  elapsed: number,
  speedNorm: number, // 0 idle, ~0.5 walk, ~1.0 jog
  isJogging: boolean,
  turnInput: number, // -1..1
  onFootstep: (side: -1 | 1) => void
): void {
  const moving = speedNorm > 0.05;
  const targetBlend = moving ? 1 : 0;
  state.blendMove = THREE.MathUtils.damp(state.blendMove, targetBlend, 10, dt);

  // Stride frequency scales with brisk walk vs sprint
  const freq = isJogging ? 13.2 : 8.8;
  if (moving) {
    state.phase += dt * freq * Math.max(0.55, speedNorm);
    const curSin = Math.sin(state.phase);
    // Zero crossing triggers footfall
    if ((state.prevSin < 0 && curSin >= 0) || (state.prevSin > 0 && curSin <= 0)) {
      onFootstep(curSin >= 0 ? 1 : -1);
    }
    state.prevSin = curSin;
  }

  const s = Math.sin(state.phase);
  const c = Math.cos(state.phase);
  const b = state.blendMove;

  const legSwing = (isJogging ? 0.78 : 0.54) * b;
  const armSwing = (isJogging ? 0.85 : 0.48) * b;

  // Legs
  rig.leftHip.rotation.x = s * legSwing;
  rig.rightHip.rotation.x = -s * legSwing;

  // Knee bends backward (+X in local coords since forward is -Z) when swinging back/lifting
  const leftKneeBend = Math.max(0, -c) * (isJogging ? 0.95 : 0.55) * b;
  const rightKneeBend = Math.max(0, c) * (isJogging ? 0.95 : 0.55) * b;
  rig.leftKnee.rotation.x = leftKneeBend;
  rig.rightKnee.rotation.x = rightKneeBend;

  // Arms swing opposite to legs
  rig.leftShoulder.rotation.x = -s * armSwing;
  rig.rightShoulder.rotation.x = s * armSwing;
  rig.leftElbow.rotation.x = -((isJogging ? 0.95 : 0.35) * b + 0.12);
  rig.rightElbow.rotation.x = -((isJogging ? 0.95 : 0.35) * b + 0.12);

  // Subtle vertical bounce & forward lean
  const bob = Math.abs(c) * (isJogging ? 0.065 : 0.036) * b;
  const idleBreath = Math.sin(elapsed * 2.1) * 0.008 * (1 - b);
  rig.bodyPivot.position.y = 0.88 + bob + idleBreath;

  const forwardLean = (isJogging ? 0.18 : 0.07) * b;
  rig.torsoGroup.rotation.x = -forwardLean;
  rig.torsoGroup.rotation.y = -s * 0.06 * b;

  // Turn bank
  state.turnBank = THREE.MathUtils.damp(state.turnBank, turnInput * 0.1, 8, dt);
  rig.torsoGroup.rotation.z = state.turnBank;

  // Idle head look-around
  rig.headGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.14 * (1 - b);
  rig.headGroup.rotation.x = forwardLean * 0.55;

  // Contact shadow subtly pulses with height
  const shadowScale = 1 - bob * 1.4;
  rig.contactShadow.scale.set(shadowScale, shadowScale, 1);

  // Beacon pulse
  rig.beaconMat.emissiveIntensity = 1.2 + Math.sin(elapsed * 4.2) * 0.45;
}
