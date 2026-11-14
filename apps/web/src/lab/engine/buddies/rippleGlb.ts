/**
 * Ripple, from the approved asset `public/models/buddy/ripple-waterbuddy.glb`.
 *
 * The page loads a compressed copy, `ripple-waterbuddy.opt.glb` (2.3 MB → 1.05 MB; 1.06 → 0.49 MB
 * gzipped): the same node tree, materials, skeleton and clips, with geometry and animation in
 * EXT_meshopt_compression over the original floats (no quantization) and the two textures as
 * WebP. If that copy fails for any reason, the untouched original loads instead. Either way the
 * geometry, materials, textures, skeleton and the four clips (idle, happy, curious, celebrate)
 * are used unchanged, and the original file on disk is never modified. On top of the clips, a few things only a live scene can know are layered:
 *  - turning toward whatever Ripple is looking at, and eyes that follow it (with saccades),
 *  - a slow drift in the water,
 *  - a calm nod for glasses logged after the goal (no clip celebrates those),
 *  - idle quickening while water pours.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ClipDirector, type ReactionClip } from './clipDirector';
import type { Buddy, BuddyContext } from './types';
import type { Pose } from '../animator';
import { mulberry32 } from '../noise';

export const RIPPLE_URL = '/models/buddy/ripple-waterbuddy.opt.glb';
/** The supplied file, byte for byte: the fallback if the compressed copy can't be used. */
export const RIPPLE_ORIGINAL_URL = '/models/buddy/ripple-waterbuddy.glb';
/** The asset was authored at about 1 unit tall; this matches the pond's framing. */
const SCALE = 1.28;

export type LoadState = 'loading' | 'ready' | 'error';

export interface AssetStats {
  /** Which file loaded (the compressed copy, or the original as a fallback). */
  file: string;
  bytes: number;
  triangles: number;
  meshes: number;
  bones: number;
  clips: { name: string; seconds: number }[];
  extensions: string[];
  loadMs: number;
}

export interface GlbBuddy extends Buddy {
  readonly state: LoadState;
  readonly error: string | null;
  readonly stats: AssetStats | null;
  readonly director: ClipDirector | null;
  load(): Promise<void>;
  /** Ripple's transmissive materials (the reflection pass skips their transmission). */
  liquidMaterials(): THREE.MeshPhysicalMaterial[];
  /**
   * Play a reaction clip, or a layered response that never restarts the clip playing:
   * 'nod' (a calm acknowledgement) or 'giggle' (a ticklish wriggle when tapped mid-reaction).
   */
  react(kind: ReactionClip | 'nod' | 'giggle'): boolean;
  setReduced(r: boolean): void;
}

const SILHOUETTE_MESHES = new Set(['body', 'head_shell', 'chest']);
const SILHOUETTE_GROUPS = new Set(['crest', 'fin_L', 'fin_R', 'tail_fan']);
function castsShadow(o: THREE.Object3D): boolean {
  if (SILHOUETTE_MESHES.has(o.name)) return true;
  // Beads ride the spine bones (children of the body), so only named groups count here.
  for (let n = o.parent; n; n = n.parent) if (SILHOUETTE_GROUPS.has(n.name)) return true;
  return false;
}

/**
 * Low tier: no transmission pass (measured: it redraws every opaque object behind Ripple, about
 * +30% frame time at phone size, whatever its resolution). Instead the skin is made opaque with
 * the colour the light coming *through* it would have had: the scene behind (about mid-grey in
 * linear terms) tinted by the asset's own volume attenuation over its own thickness, mixed in by
 * its own transmission amount. Runtime only; the file is not changed.
 */
const SCENE_BEHIND = 0.42;
function liteLiquid(mat: THREE.MeshPhysicalMaterial) {
  const t = mat.transmission;
  const k =
    mat.attenuationDistance > 0 && Number.isFinite(mat.attenuationDistance)
      ? mat.thickness / mat.attenuationDistance
      : 0;
  const a = mat.attenuationColor;
  const through = new THREE.Color(a.r ** k, a.g ** k, a.b ** k).multiplyScalar(SCENE_BEHIND);
  mat.color.multiplyScalar(1 - t).add(through.multiplyScalar(t));
  mat.transmission = 0;
  // A little glow back, since there's no light passing through any more.
  mat.emissiveIntensity *= 1.25;
}

export function makeRippleGlb(opts: {
  url?: string;
  /** Low-end tier: transmission is switched off at runtime (the file is not changed). */
  lite?: boolean;
  onState(state: LoadState, detail?: string): void;
}): GlbBuddy {
  const urls = opts.url ? [opts.url] : [RIPPLE_URL, RIPPLE_ORIGINAL_URL];
  const root = new THREE.Group();
  root.name = 'ripple-glb';
  const facing = new THREE.Group();
  const drift = new THREE.Group();
  const holder = new THREE.Group();
  holder.scale.setScalar(SCALE);
  root.add(facing);
  facing.add(drift);
  drift.add(holder);

  const hit: THREE.Object3D[] = [];
  let liquid: THREE.MeshPhysicalMaterial[] = [];
  let director: ClipDirector | null = null;
  let state: LoadState = 'loading';
  let error: string | null = null;
  let stats: AssetStats | null = null;
  let model: THREE.Object3D | null = null;
  let head: THREE.Object3D | null = null;
  const eyes: THREE.Object3D[] = [];
  /** Parts the live layer moves on top of the clips (looked up by node name). */
  const parts = {
    finL: null as THREE.Object3D | null,
    finR: null as THREE.Object3D | null,
    cheekL: null as THREE.Object3D | null,
    cheekR: null as THREE.Object3D | null,
    tail: null as THREE.Object3D | null,
    antennae: [] as THREE.Object3D[]
  };
  let reduced = false;
  // Springs for the live layer: the head follows the eyes, antennae lag the head, the body
  // leans toward what Ripple watches, and fins paddle into turns.
  const spring = (k: number, d: number) => ({ x: 0, v: 0, k, d });
  const step = (s: { x: number; v: number; k: number; d: number }, target: number, dt: number) => {
    s.v += ((target - s.x) * s.k - s.v * s.d) * dt;
    s.x += s.v * dt;
    return s.x;
  };
  const headYaw = spring(30, 9);
  const headPitch = spring(30, 9);
  const lean = spring(12, 6);
  const finPaddle = spring(40, 8);
  const antenna = [0, 1, 2, 3].map((i) => spring(70 + i * 12, 4 + i * 0.4));
  let yawPrev = 0;
  let hyPrev = 0;
  // Natural blinking: random gaps, fast close, slower open, the odd double blink.
  const lids: { upper: THREE.Object3D[]; lower: THREE.Object3D[]; lash: THREE.Object3D[] } = {
    upper: [],
    lower: [],
    lash: []
  };
  let blinkIn = 1.5;
  let blinkT = -1;
  let blinkDouble = false;
  const LID_REST = -1.0;
  const LID_SHUT = Math.PI / 2 - 0.05;
  const LOWER_REST = 0.78;
  const blinkShape = (bt: number) => {
    const one = (a: number) => {
      const x = bt - a;
      if (x < 0 || x > 0.22) return 0;
      return x < 0.07 ? x / 0.07 : x < 0.1 ? 1 : 1 - (x - 0.1) / 0.12;
    };
    return Math.max(one(0), blinkDouble ? one(0.28) : 0);
  };
  /** The celebration's whole-body flourish (fins flare, tail whips), 0..1 over the clip. */
  let celebrateT = -1;

  let yaw = 0;
  let nodT = -1;
  /** A tap mid-reaction: fins flutter, a double blink and a little head wobble. */
  let giggleT = -1;
  let disposed = false;
  const saccade = new THREE.Vector2();
  let saccadeIn = 0.5;
  const rand = mulberry32(23);
  const tmp = new THREE.Vector3();
  const headCentre = new THREE.Vector3(0, 0.72, 0);

  const setState = (s: LoadState, detail?: string) => {
    state = s;
    opts.onState(s, detail);
  };

  const prepare = (scene: THREE.Object3D) => {
    let triangles = 0;
    let meshes = 0;
    let bones = 0;
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones++;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      const g = m.geometry;
      const count = g.index ? g.index.count / 3 : g.attributes.position!.count / 3;
      triangles += count * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
      // Rendering settings only (not the asset): shadows, and no culling of skinned meshes,
      // whose bounds move with the animation.
      const mat = m.material as THREE.MeshPhysicalMaterial;
      // Only the silhouette casts shadows; eyes, lids, antennae, hands and beads skip the
      // shadow pass. Measured: draw calls, not triangles, are what weak devices pay for.
      m.castShadow = !mat.transparent && castsShadow(m);
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
      if (m.name === 'body' || m.name === 'head_shell' || m.name === 'chest') hit.push(m);
      if (!seen.has(mat)) {
        seen.add(mat);
        if (mat.transmission > 0) {
          if (opts.lite) liteLiquid(mat);
          else liquid.push(mat);
        }
      }
    });
    return { triangles, meshes, bones };
  };

  const buddy: GlbBuddy = {
    id: 'sprite',
    root,
    hit,
    refractionHidden: [root],
    temperament: { bounce: 0.85, tempo: 1, float: 0.55 },
    height: 1.3,
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    get stats() {
      return stats;
    },
    get director() {
      return director;
    },
    async load() {
      if (state === 'ready') return;
      setState('loading');
      error = null;
      const t0 = performance.now();
      let bytes = 0;
      try {
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>> | null = null;
        let file = '';
        for (const [i, u] of urls.entries()) {
          try {
            gltf = await loader.loadAsync(u, (e) => {
              bytes = e.total || e.loaded;
            });
            file = u.split('/').pop()!;
            break;
          } catch (e) {
            if (i === urls.length - 1) throw e;
            console.warn(`Ripple: ${u} didn't load, trying the original file.`, e);
          }
        }
        if (!gltf) throw new Error('Ripple GLB did not load');
        if (disposed) {
          // The scene went away while this was loading (a page change, or React's dev-mode
          // double mount): free what was loaded and report nothing.
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            m.geometry?.dispose();
            const mat = m.material as THREE.Material | THREE.Material[] | undefined;
            for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
              for (const v of Object.values(x)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
              x.dispose();
            }
          });
          return;
        }
        if (model) holder.remove(model);
        model = gltf.scene;
        hit.length = 0;
        liquid = [];
        const counts = prepare(model);
        holder.add(model);
        head = model.getObjectByName('head') ?? null;
        eyes.length = 0;
        for (const n of ['eyeball_L', 'eyeball_R']) {
          const e = model.getObjectByName(n);
          if (e) eyes.push(e);
        }
        parts.finL = model.getObjectByName('fin_L') ?? null;
        parts.finR = model.getObjectByName('fin_R') ?? null;
        parts.cheekL = model.getObjectByName('cheekfin_L') ?? null;
        parts.cheekR = model.getObjectByName('cheekfin_R') ?? null;
        parts.tail = model.getObjectByName('tail_fan') ?? null;
        lids.upper = ['lid_upper_L', 'lid_upper_R']
          .map((n) => model!.getObjectByName(n))
          .filter((o): o is THREE.Object3D => !!o);
        lids.lower = ['lid_lower_L', 'lid_lower_R']
          .map((n) => model!.getObjectByName(n))
          .filter((o): o is THREE.Object3D => !!o);
        lids.lash = ['lash_L', 'lash_R'].map((n) => model!.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
        parts.antennae = [0, 1, 2, 3]
          .map((i) => model!.getObjectByName(`antenna_${i}`))
          .filter((a): a is THREE.Object3D => !!a);
        director?.dispose();
        director = new ClipDirector(model, gltf.animations);
        if (director.missing.length) console.warn(`Ripple GLB is missing clips: ${director.missing.join(', ')}`);
        stats = {
          file,
          bytes,
          ...counts,
          clips: gltf.animations.map((c) => ({ name: c.name, seconds: c.duration })),
          extensions: (gltf.parser.json.extensionsUsed as string[] | undefined) ?? [],
          loadMs: Math.round(performance.now() - t0)
        };
        setState('ready');
      } catch (e) {
        if (disposed) return;
        error = e instanceof Error ? e.message : String(e);
        setState('error', error);
      }
    },
    liquidMaterials() {
      return liquid;
    },
    react(kind) {
      if (!director) return false;
      if (kind === 'nod') {
        nodT = 0;
        return true;
      }
      if (kind === 'giggle') {
        giggleT = 0;
        blinkT = 0;
        blinkDouble = true;
        return true;
      }
      // With reduced motion, the celebration's jump and spin become a gentler happy.
      const clip = reduced && kind === 'celebrate' ? 'happy' : kind;
      const ok = director.request(clip);
      if (ok) {
        // A blink as the expression changes hides the switch and reads as a thought.
        if (blinkT < 0) {
          blinkT = 0;
          blinkDouble = false;
        }
        if (clip === 'celebrate') celebrateT = 0;
      }
      return ok;
    },
    setReduced(r) {
      reduced = r;
    },
    apply(_p: Pose, ctx: BuddyContext) {
      if (!director || !model) return;
      const dt = Math.min(ctx.dt, 0.1);
      const t = ctx.t;
      const calm = reduced ? 0.3 : 1;
      // Turn toward what Ripple is looking at, softly and only part of the way.
      tmp.copy(ctx.look);
      root.worldToLocal(tmp);
      const want = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -0.8, 0.8) * 0.45;
      yaw += (want - yaw) * (1 - Math.exp(-dt * 2.5));
      facing.rotation.y = yaw;
      // Drifting in the water; rates chosen so it never visibly repeats.
      drift.position.set(
        (Math.sin(t * 0.55) * 0.03 + Math.sin(t * 0.23 + 2) * 0.01) * calm,
        0,
        Math.sin(t * 0.41) * 0.015 * calm
      );
      drift.rotation.z = -(Math.cos(t * 0.55) * 0.04 + Math.cos(t * 0.23 + 2) * 0.01) * calm;

      director.setIdleSpeed(reduced ? 0.7 : 1 + 0.9 * (ctx.flow ?? 0));
      director.update(dt);

      // After the clip has posed everything, layer the live parts on top (all additive).
      const flow = ctx.flow ?? 0;
      const ex = Math.min(1.5, flow * 1.2 + (director.playing ? 0.5 : 0));
      const yawVel = (yaw - yawPrev) / Math.max(dt, 1e-3);
      yawPrev = yaw;
      // Fins: each keeps its own slowly drifting rhythm, quicker when excited, and paddles
      // against a turn; cheek fins flicker; the tail fan swishes.
      const fa = (0.07 + 0.1 * ex) * calm;
      const paddle = step(finPaddle, THREE.MathUtils.clamp(yawVel * 0.25, -0.25, 0.25), dt);
      parts.finL?.rotateY(-(Math.sin(t * (2.3 + 3 * ex) + 0.4 * Math.sin(t * 0.31)) * fa) - paddle);
      parts.finR?.rotateY(Math.sin(t * (2.65 + 3.4 * ex) + 1.9 + 0.4 * Math.sin(t * 0.27 + 1)) * fa * 0.9 - paddle);
      parts.finL?.rotateX(Math.sin(t * 0.8) * 0.06 * calm);
      parts.finR?.rotateX(Math.sin(t * 0.67 + 2) * 0.06 * calm);
      parts.cheekL?.rotateY(-Math.sin(t * (5 + 4 * ex)) * 0.1 * calm);
      parts.cheekR?.rotateY(Math.sin(t * (5.6 + 4 * ex) + 1) * 0.1 * calm);
      parts.tail?.rotateX(Math.sin(t * (2.6 + 3 * ex) - 1) * (0.06 + 0.08 * ex) * calm);
      // Celebrations use the whole body: fins flare wide and the tail whips with the jump.
      if (celebrateT >= 0) {
        celebrateT += dt;
        const u = celebrateT / 3.4;
        if (u >= 1) celebrateT = -1;
        else {
          const flare = Math.sin(Math.PI * Math.min(1, u * 1.25)) * calm;
          parts.finL?.rotateY(-0.35 * flare);
          parts.finR?.rotateY(0.35 * flare);
          parts.tail?.rotateX(Math.sin(t * 9) * 0.22 * flare);
          parts.cheekL?.rotateY(-0.3 * flare);
          parts.cheekR?.rotateY(0.3 * flare);
        }
      }
      // A giggle: quick flutters on top of whatever the clip is doing.
      let giggle = 0;
      if (giggleT >= 0) {
        giggleT += dt;
        const u = giggleT / 0.9;
        if (u >= 1) giggleT = -1;
        else {
          giggle = Math.sin(Math.PI * u) * calm;
          parts.finL?.rotateY(-Math.sin(t * 22) * 0.2 * giggle);
          parts.finR?.rotateY(Math.sin(t * 22 + 1) * 0.2 * giggle);
          parts.cheekL?.rotateY(-Math.sin(t * 30) * 0.25 * giggle);
          parts.cheekR?.rotateY(Math.sin(t * 30 + 1) * 0.25 * giggle);
          parts.tail?.rotateX(Math.sin(t * 16) * 0.14 * giggle);
        }
      }
      // Lids: while idling, hold them at rest (the idle clip's baked blinks would repeat every
      // four seconds) and blink naturally instead. Reactions keep their own lids.
      const iw = director.idleWeight;
      blinkIn -= dt;
      if (blinkIn <= 0 && blinkT < 0) {
        blinkT = 0;
        blinkDouble = rand() < 0.2;
        blinkIn = 2.2 + rand() * 4.5;
      }
      let b = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        b = blinkShape(blinkT);
        if (blinkT > (blinkDouble ? 0.52 : 0.24)) blinkT = -1;
      }
      for (const l of lids.upper) {
        const x = THREE.MathUtils.lerp(l.rotation.x, LID_REST, iw);
        l.rotation.x = THREE.MathUtils.lerp(x, LID_SHUT, b);
      }
      for (const l of lids.lower) l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, LOWER_REST, iw);
      for (const l of lids.lash) {
        const k = THREE.MathUtils.smoothstep(b, 0.55, 0.9);
        l.scale.set(Math.max(0.001, k), Math.max(0.001, k * 0.45), 1);
      }
      // The body leans toward what Ripple is watching (forward and down for the pour).
      tmp.copy(ctx.look);
      root.worldToLocal(tmp);
      const lookDown = THREE.MathUtils.clamp((0.9 - tmp.y) / Math.max(1, Math.hypot(tmp.x, tmp.z)), -0.5, 1);
      facing.rotation.x = step(lean, lookDown * 0.09 * calm + flow * 0.04 * calm, dt);
      if (head && nodT >= 0) {
        nodT += dt;
        const u = nodT / 1.3;
        if (u >= 1) nodT = -1;
        else head.rotateX(0.16 * Math.sin(u * Math.PI * 2) * (1 - u) * (reduced ? 0.5 : 1));
      }
      if (head && giggle > 0) head.rotateZ(Math.sin(giggleT * Math.PI * 4.4) * 0.07 * giggle);
      if (head && eyes.length) {
        saccadeIn -= dt;
        if (saccadeIn <= 0) {
          saccadeIn = 0.35 + rand() * 1.2;
          saccade.set((rand() - 0.5) * 0.16, (rand() - 0.5) * 0.1);
        }
        tmp.copy(ctx.look);
        head.worldToLocal(tmp);
        tmp.sub(headCentre).normalize();
        const lx = THREE.MathUtils.clamp(tmp.x * 1.6 + saccade.x, -1, 1);
        const ly = THREE.MathUtils.clamp(tmp.y * 1.6 + saccade.y, -1, 1);
        // The eyes jump straight to the target; the head follows a beat later, part of the way.
        const hy = step(headYaw, lx * 0.22 * calm, dt);
        const hp = step(headPitch, ly * 0.12 * calm, dt);
        head.rotateY(hy);
        head.rotateX(-hp);
        for (const e of eyes) e.rotation.set(-ly * 0.38, lx * 0.48, 0);
        // Antennae lag the head's turn, then wobble back.
        const hv = (hy - hyPrev) / Math.max(dt, 1e-3);
        hyPrev = hy;
        parts.antennae.forEach((a, i) =>
          a.rotateZ(step(antenna[i]!, -hv * 0.15 + Math.sin(t * 2.4 + i * 1.3) * 0.04 * calm, dt))
        );
      }
    },
    dispose() {
      disposed = true;
      director?.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    }
  };
  return buddy;
}
