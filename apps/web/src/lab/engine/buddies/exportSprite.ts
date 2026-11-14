/**
 * Exports Ripple as a binary glTF (.glb): mesh, PBR materials and textures, the 7-bone
 * spine skin, the mouth's smile/open/round morph targets, and four animation clips recorded
 * from the live animation system (idle, happy, curious, celebrate). Loaded lazily, so the
 * exporter isn't in the lab's first download.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Animator, DURATION, type Reaction } from '../animator';
import { buildSpriteModel, RippleMotion, type SpriteParts } from './sprite';

const FPS = 30;
const TEMPERAMENT = { bounce: 0.85, tempo: 1, float: 0.55 };

function animatedNodes(root: THREE.Object3D, parts: SpriteParts): THREE.Object3D[] {
  const nodes: THREE.Object3D[] = [
    root,
    parts.head,
    parts.crest,
    parts.tailFan,
    ...parts.bones,
    ...parts.fins,
    ...parts.cheekFins,
    ...parts.arms,
    ...parts.antennae
  ];
  for (const e of parts.eyes) nodes.push(e.ball, e.upper, e.lower, e.arc);
  return nodes;
}

function record(kind: Reaction | 'idle', root: THREE.Object3D, parts: SpriteParts): THREE.AnimationClip {
  const anim = new Animator(TEMPERAMENT, false, 7);
  const motion = new RippleMotion(3);
  if (kind !== 'idle') anim.trigger(kind);
  const seconds = kind === 'idle' ? 4 : DURATION[kind] / TEMPERAMENT.tempo + 0.2;
  const frames = Math.round(seconds * FPS);
  const nodes = animatedNodes(root, parts);
  const times: number[] = [];
  const quats = nodes.map(() => [] as number[]);
  const posR: number[] = [];
  const scaleR: number[] = [];
  const scales = parts.eyes.map(() => [] as number[]);
  const morph: number[] = [];
  const look = new THREE.Vector2();
  const q = new THREE.Quaternion();
  for (let f = 0; f <= frames; f++) {
    const t = f / FPS;
    const p = anim.update(f === 0 ? 0 : 1 / FPS);
    motion.apply(parts, p, t, 1 / FPS, look, 0, 0.6);
    // Whole-body motion that the scene's rig normally adds.
    root.position.set(0, p.hop + 0.14, 0);
    root.rotation.set(p.leanZ, p.spin, -p.leanX, 'YXZ');
    const sy = 1 + p.squash * 0.9;
    const sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    root.scale.set(sxz, sy, sxz);
    times.push(t);
    nodes.forEach((n, i) => quats[i]!.push(...q.copy(n.quaternion).toArray()));
    posR.push(root.position.x, root.position.y, root.position.z);
    scaleR.push(root.scale.x, root.scale.y, root.scale.z);
    parts.eyes.forEach((e, i) => scales[i]!.push(e.arc.scale.x, e.arc.scale.y, e.arc.scale.z));
    morph.push(...(parts.mouth.morphTargetInfluences ?? [0, 0, 0]));
  }
  const tracks: THREE.KeyframeTrack[] = nodes.map(
    (n, i) => new THREE.QuaternionKeyframeTrack(`${n.uuid}.quaternion`, times, quats[i]!)
  );
  tracks.push(new THREE.VectorKeyframeTrack(`${root.uuid}.position`, times, posR));
  tracks.push(new THREE.VectorKeyframeTrack(`${root.uuid}.scale`, times, scaleR));
  parts.eyes.forEach((e, i) => tracks.push(new THREE.VectorKeyframeTrack(`${e.arc.uuid}.scale`, times, scales[i]!)));
  tracks.push(new THREE.NumberKeyframeTrack(`${parts.mouth.uuid}.morphTargetInfluences`, times, morph));
  return new THREE.AnimationClip(kind, seconds, tracks);
}

/** Builds Ripple at rest, records its clips and returns the .glb bytes. */
export async function exportSpriteGlb(): Promise<ArrayBuffer> {
  const { model, parts } = buildSpriteModel();
  const root = new THREE.Group();
  root.name = 'Ripple_root';
  root.add(model);
  root.updateMatrixWorld(true);
  const clips = (['idle', 'happy', 'curious', 'celebrate'] as const).map((k) => record(k, root, parts));
  // Back to rest before writing the bind pose.
  const rest = new Animator(TEMPERAMENT, false, 7).update(0);
  new RippleMotion(3).apply(parts, rest, 0, 1 / FPS, new THREE.Vector2(), 0, 0.6);
  root.position.set(0, 0.14, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const out = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: true });
  return out as ArrayBuffer;
}
