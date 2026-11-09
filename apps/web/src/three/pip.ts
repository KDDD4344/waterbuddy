/**
 * Pip: a hermit crab whose shell is a glass bottle (decision D-002).
 *
 * Built procedurally from primitives so the motion can be designed before the production
 * model exists. In Phase 7 the meshes are replaced by a Blender glTF, but this rig's
 * behaviour (eyes, blinks, claw poses, hide/peek, reactions) stays as code layered on top.
 */
import * as THREE from 'three';
import { bump, damp, easeOut, rand, Spring } from './math';
import { glassMaterial, liquidMaterial } from './shaders';

export type Expression = 'idle' | 'happy' | 'surprised' | 'sleepy';
export type Action = 'hide' | 'cheer' | 'dance' | 'wave' | 'peek' | 'click' | 'nod';

const ACTION_SECONDS: Record<Action, number> = { hide: 1.1, cheer: 1.1, dance: 2.2, wave: 1.4, peek: 0.9, click: 0.5, nod: 0.8 };

export interface PipRig {
  root: THREE.Group;
  /** Part of Pip you can tap. */
  hitTarget: THREE.Object3D;
  readonly fill: number;
  setFill(fill: number, instant?: boolean): void;
  setExpression(e: Expression): void;
  trigger(a: Action, seconds?: number): void;
  setHidden(hidden: boolean): void;
  /** Push the cork into the neck (goal reached) or pull it out. */
  setCorked(corked: boolean, instant?: boolean): void;
  readonly corked: boolean;
  lookAt(worldPoint: THREE.Vector3 | null): void;
  /** Slosh the liquid. */
  impulse(x?: number, z?: number): void;
  mouthWorld(out?: THREE.Vector3): THREE.Vector3;
  liquidCenterWorld(out?: THREE.Vector3): THREE.Vector3;
  /** World-space height of the liquid surface. */
  readonly surfaceY: number;
  update(dt: number, t: number): void;
  dispose(): void;
}

const BOTTLE_PROFILE: [number, number][] = [
  [0.0, -1.2], [0.5, -1.2], [0.66, -1.14], [0.72, -1.02], [0.73, 0.45], [0.66, 0.72], [0.46, 0.92],
  [0.3, 1.04], [0.27, 1.12], [0.27, 1.46], [0.31, 1.49], [0.31, 1.56], [0.26, 1.58]
];
const LIQUID_PROFILE: [number, number][] = [
  [0.0, -1.12], [0.48, -1.12], [0.62, -1.07], [0.67, -0.96], [0.68, 0.43], [0.61, 0.69], [0.43, 0.88], [0.27, 1.0], [0.0, 1.0]
];
const v2 = (p: [number, number]) => new THREE.Vector2(p[0], p[1]);

export function buildPip({ fill = 0.45 }: { fill?: number } = {}): PipRig {
  const root = new THREE.Group();
  root.name = 'pip';
  const M = {
    coral: new THREE.MeshPhysicalMaterial({ color: 0xe9784f, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.7, sheenColor: new THREE.Color(0xffc9a6) }),
    plate: new THREE.MeshPhysicalMaterial({ color: 0xc0523a, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    cream: new THREE.MeshPhysicalMaterial({ color: 0xf7e2c4, roughness: 0.5, sheen: 0.5 }),
    tip: new THREE.MeshPhysicalMaterial({ color: 0x5a2a22, roughness: 0.35, clearcoat: 0.8 }),
    eye: new THREE.MeshPhysicalMaterial({ color: 0xfcfbf6, roughness: 0.12, clearcoat: 1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: 0x0f1d26, roughness: 0.08, clearcoat: 1 }),
    hi: new THREE.MeshBasicMaterial({ color: 0xffffff })
  };

  // --- bottle: home, progress vessel, (later) boat and mailbox ---
  const yaw = new THREE.Group();
  yaw.rotation.y = -0.2;
  root.add(yaw);
  const bottle = new THREE.Group();
  bottle.rotation.z = -1.22;
  yaw.add(bottle);
  const glassGeo = new THREE.LatheGeometry(BOTTLE_PROFILE.map(v2), 56);
  const glassBack = new THREE.Mesh(glassGeo, glassMaterial({ side: THREE.BackSide, opacity: 0.07 }));
  glassBack.renderOrder = 1;
  const glassFront = new THREE.Mesh(glassGeo, glassMaterial({ side: THREE.FrontSide, opacity: 0.1 }));
  glassFront.renderOrder = 4;
  const liquidGeo = new THREE.LatheGeometry(LIQUID_PROFILE.map(v2), 56);
  const front = liquidMaterial(undefined, THREE.FrontSide);
  const back = liquidMaterial(front.uniforms, THREE.BackSide);
  const liquidBack = new THREE.Mesh(liquidGeo, back.material);
  liquidBack.renderOrder = 2;
  const liquid = new THREE.Mesh(liquidGeo, front.material);
  liquid.renderOrder = 3;
  bottle.add(glassBack, liquidBack, liquid, glassFront);

  // cork: sits in the neck once the day's goal is met
  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.25, 0.36, 24),
    new THREE.MeshStandardMaterial({ color: 0xb5835a, roughness: 0.92 })
  );
  cork.renderOrder = 3;
  cork.visible = false;
  bottle.add(cork);
  const CORK_IN = 1.5; // pokes just out of the lip so it reads as a cork
  let corkOn = false;
  let corkT = 0;

  const rz = bottle.rotation.z;
  const dir = new THREE.Vector3(-Math.sin(rz), Math.cos(rz), 0);
  const mouth = dir.clone().multiplyScalar(1.58);

  // --- Pip ---
  const pip = new THREE.Group();
  yaw.add(pip);
  const seat = mouth.clone().add(dir.clone().multiplyScalar(0.12)).add(new THREE.Vector3(0, 0.08, 0));
  pip.position.copy(seat);
  const body = new THREE.Group();
  pip.add(body);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 40, 28), M.coral);
  shell.scale.set(1.12, 0.78, 0.96);
  body.add(shell);
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.41, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), M.plate);
  plate.scale.set(1.12, 0.8, 0.97);
  plate.position.y = 0.012;
  body.add(plate);
  for (const [x, y, z, r] of [
    [0.16, 0.26, 0.14, 0.05],
    [-0.12, 0.27, 0.16, 0.04],
    [0.02, 0.3, -0.05, 0.035]
  ] as const) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), M.cream);
    s.position.set(x, y, z);
    s.scale.y = 0.45;
    body.add(s);
  }
  for (const x of [-0.05, 0.05]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), M.cream);
    m.position.set(x, -0.08, 0.36);
    body.add(m);
  }

  function makeEye(side: number) {
    const stalk = new THREE.Group();
    stalk.position.set(0.14 * side, 0.2, 0.17);
    body.add(stalk);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.38, 14), M.coral);
    st.position.y = 0.19;
    stalk.add(st);
    const eye = new THREE.Group();
    eye.position.y = 0.4;
    stalk.add(eye);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 20), M.eye));
    const pupil = new THREE.Group();
    eye.add(pupil);
    const pp = new THREE.Mesh(new THREE.SphereGeometry(0.078, 24, 16), M.pupil);
    pp.position.z = 0.07;
    pp.scale.z = 0.6;
    pupil.add(pp);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), M.hi);
    hl.position.set(0.03 * side + 0.01, 0.035, 0.118);
    pupil.add(hl);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.128, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), M.plate);
    eye.add(lid);
    return { stalk, pupil, lid };
  }
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);

  function makeAntenna(side: number) {
    const g = new THREE.Group();
    g.position.set(0.05 * side, 0.02, 0.33);
    body.add(g);
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.08 * side, 0.18, 0.12),
      new THREE.Vector3(0.22 * side, 0.28, 0.1),
      new THREE.Vector3(0.36 * side, 0.3, -0.02)
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.011, 6), M.plate));
    return g;
  }
  const antL = makeAntenna(-1);
  const antR = makeAntenna(1);

  function makeClaw(side: number, s: number) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.34 * side, -0.1, 0.18);
    body.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * s, 0.2 * s, 6, 12), M.coral);
    upper.rotation.z = Math.PI / 2;
    upper.position.x = 0.14 * s * side;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.x = 0.28 * s * side;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * s, 0.14 * s, 6, 12), M.coral);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = 0.1 * s;
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.z = 0.22 * s;
    elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 28, 20), M.coral);
    palm.scale.set(1.15, 0.9, 1.05);
    hand.add(palm);
    const fixedF = new THREE.Mesh(new THREE.SphereGeometry(0.065 * s, 16, 12), M.coral);
    fixedF.position.set(0, -0.05 * s, 0.2 * s);
    fixedF.scale.set(1, 0.75, 2.6);
    hand.add(fixedF);
    const tip1 = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 10, 8), M.tip);
    tip1.position.set(0, -0.05 * s, 0.36 * s);
    hand.add(tip1);
    const dact = new THREE.Group();
    dact.position.set(0, 0.06 * s, 0.08 * s);
    hand.add(dact);
    const df = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 16, 12), M.plate);
    df.position.z = 0.13 * s;
    df.scale.set(1, 0.75, 2.5);
    dact.add(df);
    const tip2 = new THREE.Mesh(new THREE.SphereGeometry(0.032 * s, 10, 8), M.tip);
    tip2.position.z = 0.27 * s;
    dact.add(tip2);
    return { shoulder, elbow, dact };
  }
  const clawR = makeClaw(1, 1.05);
  const clawL = makeClaw(-1, 0.62);

  const legs: { hip: THREE.Group; knee: THREE.Group; side: number }[] = [];
  for (const [side, z] of [
    [1, 0.06],
    [1, -0.12],
    [-1, 0.06],
    [-1, -0.12]
  ] as const) {
    const hip = new THREE.Group();
    hip.position.set(0.3 * side, -0.16, z);
    body.add(hip);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 10), M.coral);
    a.rotation.z = Math.PI / 2 - 0.7 * side;
    a.position.set(0.09 * side, -0.05, 0);
    hip.add(a);
    const knee = new THREE.Group();
    knee.position.set(0.18 * side, -0.11, 0);
    hip.add(knee);
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 4, 10), M.coral);
    b.position.y = -0.12;
    b.rotation.z = 0.25 * side;
    knee.add(b);
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.tip);
    t.position.set(0.03 * side, -0.24, 0);
    knee.add(t);
    legs.push({ hip, knee, side });
  }

  // --- motion state ---
  const W: Record<Expression, number> = { idle: 1, happy: 0, surprised: 0, sleepy: 0 };
  let expr: Expression = 'idle';
  let actions: { a: Action; t: number; d: number }[] = [];
  let look: THREE.Vector3 | null = null;
  const sacL = new THREE.Vector2();
  const sacR = new THREE.Vector2();
  const sacTL = new THREE.Vector2();
  const sacTR = new THREE.Vector2();
  let nextSac = 0;
  let nextBlink = 1.5;
  let blinkT = -1;
  let nextClick = 4;
  let clickT = -1;
  let nextTap = 9;
  let tapT = -1;
  const fillSpring = new Spring(fill, 38, 6.5);
  let wobX = 0;
  let wobZ = 0;
  let wobVX = 0;
  let wobVZ = 0;
  let ripple = 0;
  let hideAmt = 0;
  let hiddenForced = false;
  let surfaceY = 0;

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const liqPos = liquidGeo.attributes.position as THREE.BufferAttribute;

  // lift so the bottle rests on y = 0
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(glassFront);
  yaw.position.y = -box.min.y;

  const rig: PipRig = {
    root,
    hitTarget: pip,
    get fill() {
      return fillSpring.v;
    },
    get surfaceY() {
      return surfaceY;
    },
    setFill(f, instant = false) {
      fillSpring.target = f;
      if (instant) fillSpring.snap(f);
    },
    setExpression(e) {
      expr = e;
    },
    trigger(a, seconds) {
      actions.push({ a, t: 0, d: seconds ?? ACTION_SECONDS[a] });
    },
    setHidden(h) {
      hiddenForced = h;
    },
    get corked() {
      return corkOn;
    },
    setCorked(on, instant = false) {
      corkOn = on;
      if (instant) corkT = on ? 1 : 0;
    },
    lookAt(p) {
      look = p ? p.clone() : null;
    },
    impulse(x = 1, z = 0.6) {
      wobVX += 1.6 * x;
      wobVZ += 1.2 * z;
      ripple = 1;
    },
    mouthWorld(out = new THREE.Vector3()) {
      return yaw.localToWorld(out.copy(mouth));
    },
    liquidCenterWorld(out = new THREE.Vector3()) {
      return liquid.getWorldPosition(out);
    },
    update(dt, t) {
      (Object.keys(W) as Expression[]).forEach((k) => (W[k] = damp(W[k], expr === k ? 1 : 0, 7, dt)));

      let hide = hiddenForced ? 1 : 0;
      let jump = 0;
      let sway = 0;
      let armsUp = 0;
      let wave = 0;
      let click = 0;
      let nod = 0;
      actions = actions.filter((ac) => {
        ac.t += dt;
        const p = ac.t / ac.d;
        if (ac.a === 'hide') hide = Math.max(hide, p < 0.25 ? easeOut(p / 0.25) : p > 0.75 ? 1 - easeOut((p - 0.75) / 0.25) : 1);
        if (ac.a === 'peek') hide = Math.max(hide, 0.6 * bump(p));
        if (ac.a === 'cheer') {
          jump = Math.max(jump, bump(Math.min(1, p * 1.6)) * 0.22);
          armsUp = Math.max(armsUp, bump(p));
          click = Math.max(click, bump((p * 3) % 1));
        }
        if (ac.a === 'dance') {
          sway += Math.sin(p * Math.PI * 6) * bump(p);
          armsUp = Math.max(armsUp, 0.6 * bump(p));
          jump = Math.max(jump, Math.abs(Math.sin(p * Math.PI * 6)) * 0.08 * bump(p));
        }
        if (ac.a === 'wave') wave = Math.max(wave, bump(p));
        if (ac.a === 'click') click = Math.max(click, bump((p * 2) % 1));
        if (ac.a === 'nod') nod = Math.max(nod, bump(p));
        return p < 1;
      });
      hideAmt = damp(hideAmt, hide, 14, dt);

      // cork slides down into the neck with a little overshoot
      corkT = damp(corkT, corkOn ? 1 : 0, 6, dt);
      cork.visible = corkT > 0.02;
      const over = corkOn ? Math.sin(Math.min(1, corkT) * Math.PI) * 0.06 : 0;
      cork.position.y = CORK_IN + (1 - corkT) * 0.6 - over;
      cork.scale.setScalar(0.6 + 0.4 * corkT);

      // body
      const breathe = Math.sin(t * (W.sleepy > 0.5 ? 1.2 : 2.2)) * 0.025;
      const bounce = W.happy * Math.abs(Math.sin(t * 7)) * 0.05;
      body.position.y = breathe * 0.5 + bounce + jump - W.sleepy * 0.05 - nod * 0.04;
      body.scale.set(1, 1 + breathe, 1);
      body.rotation.z = sway * 0.28 + W.happy * Math.sin(t * 7) * 0.06;
      body.rotation.x = W.sleepy * 0.18 + nod * 0.25 - W.surprised * 0.12;
      const backOff = hideAmt * 0.62 + W.surprised * 0.12;
      pip.position.copy(seat).addScaledVector(dir, -backOff);
      pip.rotation.y = 0.45;
      pip.scale.setScalar(1 - hideAmt * 0.45);
      pip.visible = hideAmt < 0.98;

      // eyes: independent saccades, look-at, blinks
      if (t > nextSac) {
        nextSac = t + rand(0.8, 3.2);
        sacTL.set(rand(-0.5, 0.5), rand(-0.35, 0.3));
        sacTR.set(Math.random() < 0.7 ? sacTL.x + rand(-0.15, 0.15) : rand(-0.5, 0.5), sacTL.y + rand(-0.15, 0.15));
      }
      let lx = sacTL.x;
      let ly = sacTL.y;
      let rx = sacTR.x;
      let ry = sacTR.y;
      if (look) {
        pip.worldToLocal(tmp.copy(look));
        const yawT = Math.atan2(tmp.x, tmp.z);
        const pitchT = Math.atan2(tmp.y - 0.5, Math.hypot(tmp.x, tmp.z));
        lx = rx = THREE.MathUtils.clamp(yawT, -0.9, 0.9);
        ly = ry = THREE.MathUtils.clamp(-pitchT, -0.9, 0.6);
      }
      sacL.set(damp(sacL.x, lx, 18, dt), damp(sacL.y, ly, 18, dt));
      sacR.set(damp(sacR.x, rx, 18, dt), damp(sacR.y, ry, 18, dt));
      const droop = W.sleepy * 0.85;
      const len = 1 + W.surprised * 0.28 + W.happy * 0.08;
      eyeL.stalk.rotation.set(0.1 + droop + sacL.y * 0.35 - W.surprised * 0.2, sacL.x * 0.5, 0.22 + W.happy * 0.18 + W.surprised * 0.12);
      eyeR.stalk.rotation.set(0.1 + droop * 0.8 + sacR.y * 0.35 - W.surprised * 0.2, sacR.x * 0.5, -0.22 - W.happy * 0.18 - W.surprised * 0.12);
      eyeL.stalk.scale.y = eyeR.stalk.scale.y = len;
      eyeL.pupil.rotation.set(sacL.y * 0.5, sacL.x * 0.7, 0);
      eyeR.pupil.rotation.set(sacR.y * 0.5, sacR.x * 0.7, 0);
      const ps = 1 - W.surprised * 0.35 + W.happy * 0.08;
      eyeL.pupil.scale.setScalar(ps);
      eyeR.pupil.scale.setScalar(ps);
      if (t > nextBlink && blinkT < 0) {
        blinkT = 0;
        nextBlink = t + rand(2.2, 5.5);
      }
      let blink = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        blink = bump(blinkT / 0.16);
        if (blinkT > 0.16) blinkT = -1;
      }
      const lidOpen = -0.75 - W.surprised * 0.5;
      const lidBase = lidOpen * (1 - W.happy - W.sleepy) + 0.55 * W.happy + 1.0 * W.sleepy;
      const lidSlow = W.sleepy * 0.35 * (0.5 + 0.5 * Math.sin(t * 0.9));
      eyeL.lid.rotation.x = THREE.MathUtils.lerp(lidBase + lidSlow, 1.6, blink);
      eyeR.lid.rotation.x = THREE.MathUtils.lerp(lidBase + lidSlow * 0.7, 1.6, blink);

      antL.rotation.set(Math.sin(t * 2.3) * 0.15, Math.sin(t * 1.7) * 0.2, 0);
      antR.rotation.set(Math.sin(t * 2.1 + 1) * 0.15, Math.sin(t * 1.5 + 2) * 0.2, 0);

      // claws: idle clicks, the occasional tap on the glass, poses
      if (t > nextClick && clickT < 0) {
        clickT = 0;
        nextClick = t + rand(5, 10);
      }
      let idleClick = 0;
      if (clickT >= 0) {
        clickT += dt;
        idleClick = bump((clickT / 0.25) % 1);
        if (clickT > 0.5) clickT = -1;
      }
      if (t > nextTap && tapT < 0 && W.idle > 0.8 && hideAmt < 0.1) {
        tapT = 0;
        nextTap = t + rand(9, 16);
      }
      let tap = 0;
      if (tapT >= 0) {
        tapT += dt;
        tap = bump(tapT / 1.2);
        if (Math.abs(tapT - 0.45) < dt || Math.abs(tapT - 0.75) < dt) {
          wobVX += 0.35;
          ripple = Math.max(ripple, 0.5);
        }
        if (tapT > 1.2) tapT = -1;
      }
      const up = Math.max(armsUp, W.happy * 0.9, W.surprised * 0.5);
      clawR.shoulder.rotation.set(
        -0.5 - up * 0.9 - wave * 0.8 + tap * 0.4,
        tap * 0.9 + wave * Math.sin(t * 14) * 0.5,
        -0.35 + up * 1.2 + wave * 1.1 - W.sleepy * 0.25
      );
      clawL.shoulder.rotation.set(-0.5 - up * 0.9, 0, 0.35 - up * 1.2 + W.sleepy * 0.25);
      clawR.elbow.rotation.set(-0.3 - up * 0.4, 0, 0);
      clawL.elbow.rotation.set(-0.3 - up * 0.4, 0, 0);
      const open = Math.max(idleClick, click, W.surprised * 0.9, W.happy * 0.4 * (0.5 + 0.5 * Math.sin(t * 9)));
      clawR.dact.rotation.x = -0.65 * open;
      clawL.dact.rotation.x = -0.65 * Math.max(open, idleClick * 0.5);
      legs.forEach((L, i) => {
        L.hip.rotation.z = Math.sin(t * 3 + i) * 0.06 * (1 + W.happy * 2);
        L.knee.rotation.z = 0.1 * L.side;
      });

      // liquid
      fillSpring.step(dt);
      const fv = Math.max(0, Math.min(1.02, fillSpring.v));
      liquid.updateMatrixWorld(true);
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < liqPos.count; i += 3) {
        tmp.fromBufferAttribute(liqPos, i).applyMatrix4(liquid.matrixWorld);
        if (tmp.y < minY) minY = tmp.y;
        if (tmp.y > maxY) maxY = tmp.y;
      }
      liquid.getWorldPosition(tmp2);
      const k = 55;
      const dmp = 3.2;
      wobVX += (-k * wobX - dmp * wobVX) * dt;
      wobX += wobVX * dt;
      wobVZ += (-k * wobZ - dmp * wobVZ) * dt;
      wobZ += wobVZ * dt;
      wobVX += -fillSpring.vel * 0.02;
      ripple = Math.max(0, ripple - dt * 0.6);
      const U = front.uniforms;
      surfaceY = minY + (maxY - minY) * fv;
      U.uFill.value = surfaceY;
      U.uWob.value.set(wobX * 0.12, wobZ * 0.12);
      U.uCenter.value.copy(tmp2);
      U.uTime.value = t;
      U.uRipple.value = ripple;
      U.uRipplePos.value.set(tmp2.x, tmp2.z);
      U.uOn.value = fv > 0.003 ? 1 : 0;
    },
    dispose() {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        }
      });
    }
  };
  rig.setFill(fill, true);
  return rig;
}
