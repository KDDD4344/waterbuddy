/**
 * Pip from an artist's glTF file (Phase 7). Turns a model that follows the naming contract
 * in content/art/pip-contract.json into the same PipRig the procedural Pip provides, so
 * the tidepool, the Waterverse and every reaction work unchanged.
 *
 * Authored clips play through an AnimationMixer. Eyes, blinks, the liquid and the slosh
 * stay code-driven, as the art brief says.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import contract from '../../../../content/art/pip-contract.json';
import type { Action, Expression, PipRig } from './pip';
import { glassMaterial, liquidMaterial } from './shaders';
import { bump, damp, Spring } from './math';

export interface PipModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export const PIP_CONTRACT = contract as { nodes: string[]; clips: string[]; shape_keys: string[]; max_triangles: number; max_bytes: number };

/** Everything wrong with a model, in plain words. Empty means it can be used. */
export function checkPipModel(model: PipModel): string[] {
  const problems: string[] = [];
  for (const name of PIP_CONTRACT.nodes) if (!model.scene.getObjectByName(name)) problems.push(`missing node "${name}"`);
  const clips = new Set(model.animations.map((a) => a.name));
  for (const name of PIP_CONTRACT.clips) if (!clips.has(name)) problems.push(`missing clip "${name}"`);
  for (const name of ['Glass', 'Liquid']) {
    const o = model.scene.getObjectByName(name);
    if (o && !(o as THREE.Mesh).isMesh) problems.push(`"${name}" must be a mesh`);
  }
  return problems;
}

export function adaptPipModel(model: PipModel, { fill = 0.45 }: { fill?: number } = {}): PipRig {
  const scene = cloneSkinned(model.scene);
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  yaw.rotation.y = -0.2;
  root.add(yaw);
  yaw.add(scene);
  const node = (name: string) => scene.getObjectByName(name) ?? new THREE.Object3D();

  // glass and liquid get the app's shaders, drawn back faces first so ordering is stable
  const glass = node('Glass') as THREE.Mesh;
  if (glass.isMesh) {
    glass.material = glassMaterial({ side: THREE.FrontSide, opacity: 0.1 });
    glass.renderOrder = 4;
    const back = new THREE.Mesh(glass.geometry, glassMaterial({ side: THREE.BackSide, opacity: 0.07 }));
    back.renderOrder = 1;
    glass.add(back);
  }
  const liquid = node('Liquid') as THREE.Mesh;
  const front = liquidMaterial(undefined, THREE.FrontSide);
  if (liquid.isMesh) {
    liquid.material = front.material;
    liquid.renderOrder = 3;
    const back = new THREE.Mesh(liquid.geometry, liquidMaterial(front.uniforms, THREE.BackSide).material);
    back.renderOrder = 2;
    liquid.add(back);
  }
  const cork = node('Cork');
  const pip = node('Pip');
  const mouth = node('Mouth');
  const eyes = [node('Eye_L'), node('Eye_R')];
  const lids = [node('Lid_L'), node('Lid_R')];
  const eyeRest = eyes.map((e) => e.quaternion.clone());
  const lidRest = lids.map((l) => l.rotation.x);
  const morphs: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences) morphs.push(m);
  });

  // rest the bottle on y = 0
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(glass.isMesh ? glass : scene);
  if (Number.isFinite(box.min.y)) yaw.position.y = -box.min.y;

  // authored clips
  const mixer = new THREE.AnimationMixer(scene);
  const clip = (name: string) => {
    const c = model.animations.find((a) => a.name === name);
    return c ? mixer.clipAction(c) : null;
  };
  const idle = clip('idle');
  idle?.play();
  const oneShots = new Map<string, THREE.AnimationAction>();
  for (const name of ['hide', 'peek', 'cheer', 'dance', 'wave', 'nod', 'click']) {
    const a = clip(name);
    if (a) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      oneShots.set(name, a);
    }
  }
  const corkAction = clip('cork');
  if (corkAction) {
    corkAction.setLoop(THREE.LoopOnce, 1);
    corkAction.clampWhenFinished = true;
  }
  let hidden = false;
  let corkOn = false;
  mixer.addEventListener('finished', (e) => {
    const a = (e as unknown as { action: THREE.AnimationAction }).action;
    if (a === corkAction || (a === oneShots.get('hide') && hidden)) return;
    a.fadeOut(0.2);
    idle?.reset().fadeIn(0.2).play();
  });
  const playOnce = (name: string) => {
    const a = oneShots.get(name);
    if (!a) return;
    a.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    idle?.fadeOut(0.12);
  };

  // code-driven state, as in the procedural Pip
  let expr: Expression = 'idle';
  const W: Record<Expression, number> = { idle: 1, happy: 0, surprised: 0, sleepy: 0 };
  let look: THREE.Vector3 | null = null;
  let nextBlink = 1.5;
  let blinkT = -1;
  const sac = new THREE.Vector2();
  const sacT = new THREE.Vector2();
  let nextSac = 0;
  const fillSpring = new Spring(fill, 38, 6.5);
  let wobX = 0;
  let wobZ = 0;
  let wobVX = 0;
  let wobVZ = 0;
  let ripple = 0;
  let surfaceY = 0;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e3 = new THREE.Euler();
  const liqPos = liquid.isMesh ? (liquid.geometry.attributes.position as THREE.BufferAttribute) : null;

  const rig: PipRig = {
    root,
    hitTarget: pip,
    get fill() {
      return fillSpring.v;
    },
    get surfaceY() {
      return surfaceY;
    },
    get corked() {
      return corkOn;
    },
    setFill(f, instant = false) {
      fillSpring.target = f;
      if (instant) fillSpring.snap(f);
    },
    setExpression(e) {
      expr = e;
    },
    trigger(a: Action) {
      playOnce(a);
    },
    setHidden(h) {
      if (h === hidden) return;
      hidden = h;
      const hide = oneShots.get('hide');
      if (!hide) {
        pip.visible = !h;
        return;
      }
      if (h) playOnce('hide');
      else {
        hide.fadeOut(0.2);
        idle?.reset().fadeIn(0.2).play();
      }
    },
    setCorked(on, instant = false) {
      corkOn = on;
      if (!corkAction) {
        cork.visible = on;
        return;
      }
      const end = corkAction.getClip().duration;
      corkAction.paused = false;
      corkAction.enabled = true;
      corkAction.timeScale = on ? 1 : -1;
      if (!corkAction.isRunning()) corkAction.reset().play();
      if (instant) {
        corkAction.time = on ? end : 0;
        mixer.update(0);
      } else corkAction.time = on ? Math.min(corkAction.time, end) : Math.max(corkAction.time, 0);
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
      return mouth.getWorldPosition(out);
    },
    liquidCenterWorld(out = new THREE.Vector3()) {
      return liquid.getWorldPosition(out);
    },
    update(dt, t) {
      mixer.update(dt);
      (Object.keys(W) as Expression[]).forEach((k) => (W[k] = damp(W[k], expr === k ? 1 : 0, 7, dt)));
      for (const m of morphs) {
        for (const k of PIP_CONTRACT.shape_keys) {
          const i = m.morphTargetDictionary![k];
          if (i !== undefined) m.morphTargetInfluences![i] = W[k as Expression] ?? 0;
        }
      }

      // eyes: look at a point, or small saccades
      if (t > nextSac) {
        sacT.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3);
        nextSac = t + 0.6 + Math.random() * 1.8;
      }
      sac.x = damp(sac.x, sacT.x, 18, dt);
      sac.y = damp(sac.y, sacT.y, 18, dt);
      eyes.forEach((eye, i) => {
        let yawE = sac.x;
        let pitch = sac.y;
        if (look && eye.parent) {
          eye.parent.worldToLocal(tmp.copy(look)).sub(eye.position);
          yawE = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -0.7, 0.7);
          pitch = THREE.MathUtils.clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.5, 0.5);
        }
        q.setFromEuler(e3.set(pitch, yawE, 0));
        eye.quaternion.copy(eyeRest[i]!).multiply(q);
      });

      // blinks and lid poses
      if (t > nextBlink && blinkT < 0) {
        blinkT = 0;
        nextBlink = t + 2.5 + Math.random() * 3.5;
      }
      let blink = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        blink = bump(blinkT / 0.16);
        if (blinkT > 0.16) blinkT = -1;
      }
      const lidPose = 0.55 * W.happy + 1.0 * W.sleepy - 0.3 * W.surprised;
      lids.forEach((lid, i) => (lid.rotation.x = THREE.MathUtils.lerp(lidRest[i]! + lidPose, 1.6, blink)));

      // liquid level, slosh and ripples
      const fv = THREE.MathUtils.clamp(fillSpring.step(dt), 0, 1);
      if (liqPos) {
        liquid.updateMatrixWorld(true);
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < liqPos.count; i += 3) {
          tmp.fromBufferAttribute(liqPos, i).applyMatrix4(liquid.matrixWorld);
          if (tmp.y < minY) minY = tmp.y;
          if (tmp.y > maxY) maxY = tmp.y;
        }
        liquid.getWorldPosition(tmp2);
        wobVX += (-55 * wobX - 3.2 * wobVX) * dt;
        wobX += wobVX * dt;
        wobVZ += (-55 * wobZ - 3.2 * wobVZ) * dt;
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
      }
    },
    dispose() {
      mixer.stopAllAction();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
    }
  };
  return rig;
}
