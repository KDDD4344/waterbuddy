/**
 * The Waterverse archipelago (Phase 5). All procedural: a stylised sea, six low-poly
 * islands with one landmark each, fog banks over places not reached yet, dotted route legs
 * and Pip's corked bottle that sails between them.
 *
 * Kept free of React so it can be unit-tested by stepping `update()` with a fake clock.
 */
import * as THREE from 'three';
import { buildPip, type PipRig } from './pip';
import { OUTPUT } from './shaders';
import { damp, easeInOut, easeOut } from './math';
import { HARBOUR, ISLANDS, type IslandStatus } from '../domain/atlas';
import type { SceneId } from '../domain/voyage';
import type { Sound } from './audio';

export type Quality = 'high' | 'low';

const FOG_GREY = new THREE.Color(0.66, 0.7, 0.7);
const silent: Sound = { enabled: false, pour() {}, tone() {}, chord() {} };

interface IslandRig {
  group: THREE.Group;
  hit: THREE.Mesh;
  /** Materials whose colour fades from grey to full colour as the fog lifts. */
  tints: { mat: THREE.MeshStandardMaterial; color: THREE.Color }[];
  fog: THREE.Points;
  fogMat: THREE.ShaderMaterial;
  birds: THREE.Group;
  /** 0 = deep fog, 1 = clear. */
  reveal: number;
  revealTarget: number;
  /** How thick the fog stays at this island (the next island is a little see-through). */
  fogLevel: number;
  /** Small things that move on their own (fins, canoes). */
  extras: ((t: number, reveal: number) => void)[];
}

interface Leg {
  curve: THREE.Curve<THREE.Vector3>;
  dots: THREE.InstancedMesh;
  mat: THREE.MeshBasicMaterial;
  shown: number;
  target: number;
}

type Phase = { kind: 'idle' } | { kind: 'sail'; leg: number; t: number; dur: number } | { kind: 'reveal'; island: number; t: number };

export class Waterverse {
  readonly group = new THREE.Group();
  readonly islands: IslandRig[] = [];
  readonly bottle: PipRig;
  reducedMotion: boolean;
  sound: Sound;
  /** Where the camera should look. Follows the bottle while it sails. */
  readonly focus = new THREE.Vector3();
  /** True while a voyage or a fog lift is playing. */
  get busy() {
    return this.phase.kind !== 'idle' || this.queue.length > 0;
  }

  private legs: Leg[] = [];
  private queue: number[] = [];
  private phase: Phase = { kind: 'idle' };
  private uTime = { value: 0 };
  private water: THREE.Mesh;
  private waterIslands: THREE.Vector4[];
  private bottleAt = new THREE.Vector3();
  private heading = 0;
  private onArrive: ((island: number) => void) | null = null;

  constructor({ quality = 'high', reducedMotion = false, sound = silent }: { quality?: Quality; reducedMotion?: boolean; sound?: Sound } = {}) {
    this.reducedMotion = reducedMotion;
    this.sound = sound;
    const hiQ = quality === 'high';

    // sky dome
    this.group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(90, 32, 16),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `varying vec3 vP; void main(){ float h = vP.y;
            vec3 c = mix(vec3(0.83, 0.90, 0.87), vec3(0.98, 0.93, 0.80), smoothstep(-0.05, 0.12, h));
            c = mix(c, vec3(0.62, 0.80, 0.86), smoothstep(0.15, 0.7, h));
            gl_FragColor = vec4(c, 1.0); ${OUTPUT} }`
        })
      )
    );

    // sea: shallows and foam around each island, greyer where the fog still sits
    this.waterIslands = ISLANDS.map((i) => new THREE.Vector4(i.x, i.z, i.radius, 0));
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.uTime, uIsl: { value: this.waterIslands } },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform float uTime; uniform vec4 uIsl[6]; varying vec3 vW;
          void main(){
            vec3 deep = vec3(0.10, 0.42, 0.48), shallow = vec3(0.45, 0.80, 0.76);
            float near = 0.0, foam = 0.0, grey = 0.0;
            for (int i = 0; i < 6; i++) {
              float d = length(vW.xz - uIsl[i].xy) - uIsl[i].z;
              float s = exp(-max(d, 0.0) * 0.9);
              near = max(near, s);
              float wob = sin(atan(vW.z - uIsl[i].y, vW.x - uIsl[i].x) * 7.0 + uTime * 1.3) * 0.08;
              foam = max(foam, smoothstep(0.16, 0.0, abs(d - 0.32 - wob - 0.06 * sin(uTime * 1.7 + float(i)))) );
              grey = max(grey, (1.0 - uIsl[i].w) * exp(-max(d, 0.0) * 0.35));
            }
            vec3 c = mix(deep, shallow, near);
            float ripple = sin(vW.x * 1.7 + uTime * 0.9) * sin(vW.z * 1.3 - uTime * 0.7);
            c += ripple * 0.025;
            float glint = pow(max(0.0, sin(vW.x * 0.9 + vW.z * 0.6 + uTime * 0.6) * sin(vW.z * 1.1 - uTime * 0.4)), 18.0);
            c += glint * 0.25;
            c = mix(c, vec3(0.95, 0.98, 0.96), foam * 0.8);
            c = mix(c, vec3(0.62, 0.69, 0.70), grey * 0.55);
            float dist = length(vW - cameraPosition);
            c = mix(c, vec3(0.83, 0.90, 0.87), smoothstep(35.0, 75.0, dist));
            gl_FragColor = vec4(c, 1.0); ${OUTPUT} }`
      })
    );
    this.water.rotation.x = -Math.PI / 2;
    this.group.add(this.water);

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
    sun.position.set(10, 20, 8);
    this.group.add(new THREE.HemisphereLight(0xe6f4f0, 0x2f6b6e, 1.15), sun);

    ISLANDS.forEach((isl, i) => this.islands.push(this.buildIsland(i, isl.card.scene, isl.radius, hiQ)));

    // route legs: harbour → 1 → 2 …
    const stops = [new THREE.Vector3(HARBOUR.x, 0.02, HARBOUR.z), ...ISLANDS.map((i) => new THREE.Vector3(i.x, 0.02, i.z))];
    const dotGeo = new THREE.CircleGeometry(0.09, 8).rotateX(-Math.PI / 2);
    for (let k = 0; k < ISLANDS.length; k++) {
      const a = stops[k]!;
      const b = stops[k + 1]!;
      const ra = k === 0 ? 0.6 : ISLANDS[k - 1]!.radius + 0.7;
      const rb = ISLANDS[k]!.radius + 0.7;
      const dir = b.clone().sub(a).normalize();
      const start = a.clone().addScaledVector(dir, ra);
      const end = b.clone().addScaledVector(dir, -rb);
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((k % 2 ? -1 : 1) * start.distanceTo(end) * 0.18));
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const n = Math.max(6, Math.floor(curve.getLength() / 0.55));
      const mat = new THREE.MeshBasicMaterial({ color: 0xfbf7ec, transparent: true, opacity: 0, depthWrite: false });
      const dots = new THREE.InstancedMesh(dotGeo, mat, n);
      const m = new THREE.Matrix4();
      for (let j = 0; j < n; j++) dots.setMatrixAt(j, m.makeTranslation(curve.getPoint((j + 0.5) / n)));
      dots.renderOrder = 2;
      this.group.add(dots);
      this.legs.push({ curve, dots, mat, shown: 0, target: 0 });
    }

    // Pip's corked bottle
    this.bottle = buildPip({ fill: 1 });
    this.bottle.setCorked(true, true);
    this.bottle.root.scale.setScalar(0.42);
    this.group.add(this.bottle.root);
    this.placeBottle(-1);
  }

  /** Apply island states. `instant` skips animation (first load, reduced motion). */
  setStatus(status: IslandStatus[], instant = false) {
    status.forEach((s, i) => {
      const rig = this.islands[i]!;
      const clear = s === 'clear';
      rig.revealTarget = clear ? 1 : 0;
      rig.fogLevel = s === 'next' || s === 'arriving' ? 0.72 : 1;
      if (instant) rig.reveal = rig.revealTarget;
      const leg = this.legs[i]!;
      leg.target = clear ? 0.9 : s === 'next' || s === 'arriving' ? 0.35 : 0;
      if (instant) leg.shown = leg.target;
    });
  }

  /**
   * Sail from `from` (-1 = harbour) through each arriving island, lifting the fog on arrival.
   * With reduced motion everything clears at once.
   */
  voyage(from: number, arrivals: number[], onArrive?: (island: number) => void) {
    this.onArrive = onArrive ?? null;
    if (!arrivals.length) {
      this.placeBottle(from);
      return;
    }
    if (this.reducedMotion) {
      for (const i of arrivals) {
        this.reveal(i, true);
        this.onArrive?.(i);
      }
      this.placeBottle(arrivals[arrivals.length - 1]!);
      return;
    }
    this.placeBottle(from);
    this.queue = [...arrivals];
    this.nextLeg();
  }

  /** The island an object belongs to, for taps. */
  islandOf(obj: THREE.Object3D | null): number {
    for (let o = obj; o; o = o.parent) if (typeof o.userData.island === 'number') return o.userData.island as number;
    return -1;
  }

  update(dt: number, t: number) {
    this.uTime.value = t;

    const ph = this.phase;
    if (ph.kind === 'sail') {
      ph.t += dt;
      const leg = this.legs[ph.leg]!;
      const u = easeInOut(ph.t / ph.dur);
      leg.curve.getPoint(u, this.bottleAt);
      const ahead = leg.curve.getPoint(Math.min(1, u + 0.02));
      if (ahead.distanceToSquared(this.bottleAt) > 1e-6) this.heading = Math.atan2(-(ahead.z - this.bottleAt.z), ahead.x - this.bottleAt.x);
      leg.target = Math.max(leg.target, 0.35 + 0.55 * u);
      this.focus.copy(this.bottleAt);
      if (ph.t >= ph.dur) {
        this.reveal(ph.leg, false);
        this.phase = { kind: 'reveal', island: ph.leg, t: 0 };
      }
    } else if (ph.kind === 'reveal') {
      ph.t += dt;
      const isl = ISLANDS[ph.island]!;
      this.focus.set(isl.x, 0, isl.z);
      if (ph.t >= 2.6) {
        this.onArrive?.(ph.island);
        this.phase = { kind: 'idle' };
        this.nextLeg();
      }
    }

    // bottle bobbing on the swell
    const b = this.bottle.root;
    b.position.set(this.bottleAt.x, -0.08 + Math.sin(t * 1.6) * 0.05, this.bottleAt.z);
    b.rotation.set(Math.sin(t * 1.1) * 0.05, this.heading, Math.sin(t * 1.3 + 1) * 0.06);
    this.bottle.update(dt, t);

    this.islands.forEach((rig, i) => {
      rig.reveal = this.reducedMotion ? rig.revealTarget : damp(rig.reveal, rig.revealTarget, 1.3, dt);
      const r = rig.reveal;
      for (const { mat, color } of rig.tints) mat.color.copy(FOG_GREY).lerp(color, r);
      const lift = easeOut(r);
      rig.fogMat.uniforms.uLift!.value = lift;
      rig.fogMat.uniforms.uDensity!.value = rig.fogLevel;
      rig.fogMat.uniforms.uTime!.value = t;
      rig.fog.visible = lift < 0.995;
      rig.birds.visible = r > 0.05;
      rig.birds.scale.setScalar(r);
      rig.birds.rotation.y = t * 0.35 + i;
      rig.birds.children.forEach((bird, j) => {
        bird.position.y = 2.6 + Math.sin(t * 2 + j * 2) * 0.15;
        (bird.children[0] as THREE.Object3D).rotation.z = 0.5 + Math.sin(t * 9 + j) * 0.35;
        (bird.children[1] as THREE.Object3D).rotation.z = -0.5 - Math.sin(t * 9 + j) * 0.35;
      });
      for (const f of rig.extras) f(t, r);
      this.waterIslands[i]!.w = r;
    });

    for (const leg of this.legs) {
      leg.shown = this.reducedMotion ? leg.target : damp(leg.shown, leg.target, 3, dt);
      leg.mat.opacity = leg.shown;
      leg.dots.visible = leg.shown > 0.01;
    }
  }

  /** For tests and diagnostics. */
  get bottlePosition(): THREE.Vector3 {
    return this.bottleAt.clone();
  }

  dispose() {
    this.bottle.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
    });
  }

  // --- internals ---

  private nextLeg() {
    const next = this.queue.shift();
    if (next === undefined) return;
    const leg = this.legs[next]!;
    this.phase = { kind: 'sail', leg: next, t: 0, dur: Math.max(2.4, leg.curve.getLength() / 3.2) };
  }

  private reveal(i: number, instant: boolean) {
    const rig = this.islands[i]!;
    rig.revealTarget = 1;
    if (instant) rig.reveal = 1;
    const leg = this.legs[i]!;
    leg.target = 0.9;
    if (instant) leg.shown = 0.9;
    if (i + 1 < this.islands.length && this.islands[i + 1]!.revealTarget === 0) {
      this.islands[i + 1]!.fogLevel = 0.72;
      this.legs[i + 1]!.target = 0.35;
    }
    if (!instant) this.sound.chord(392 + i * 30);
  }

  /** Park the bottle beside an island (or at the harbour). */
  private placeBottle(island: number) {
    if (island < 0) {
      this.bottleAt.set(HARBOUR.x, 0, HARBOUR.z);
      this.heading = Math.PI;
    } else {
      const end = this.legs[island]!.curve.getPoint(1);
      this.bottleAt.copy(end);
      const isl = ISLANDS[island]!;
      this.heading = Math.atan2(-(isl.z - end.z), isl.x - end.x) + 1.2;
    }
    this.focus.copy(this.bottleAt);
  }

  private buildIsland(index: number, scene: SceneId, radius: number, hiQ: boolean): IslandRig {
    const isl = ISLANDS[index]!;
    const group = new THREE.Group();
    group.position.set(isl.x, 0, isl.z);
    group.userData.island = index;
    this.group.add(group);
    const tints: IslandRig['tints'] = [];
    const extras: IslandRig['extras'] = [];
    const mat = (hex: number, rough = 0.9) => {
      const m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, flatShading: true });
      tints.push({ mat: m, color: new THREE.Color(hex) });
      return m;
    };
    const sand = mat(0xe3cf9f);
    const grass = mat(0x6fa35a);
    const dark = mat(0x3f6f45);
    const wood = mat(0x7a4a2e);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    const lumpy = (g: THREE.BufferGeometry, amt: number, seed: number) => {
      const p = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const n = 1 + amt * Math.sin(v.x * 3.1 + seed) * Math.sin(v.z * 2.7 + seed * 2);
        p.setXYZ(k, v.x * n, v.y, v.z * n);
      }
      g.computeVertexNormals();
      return g;
    };
    const stretch = scene === 'river-island' ? 1.7 : 1;
    const base = add(lumpy(new THREE.CylinderGeometry(radius * 0.9, radius, 0.5, 11), 0.08, index), sand, 0, 0.05, 0);
    base.scale.set(stretch, 1, 1);
    const top = add(lumpy(new THREE.SphereGeometry(radius * 0.72, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.12, index * 3), grass, 0, 0.28, 0);
    top.scale.set(stretch, 0.42, 1);

    const tree = (x: number, z: number, s = 1, leaf = dark) => {
      add(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.6 * s, 5), wood, x, 0.55 + 0.3 * s, z);
      add(new THREE.IcosahedronGeometry(0.32 * s, 0), leaf, x, 0.6 + 0.65 * s, z);
    };
    const palm = (x: number, z: number) => {
      add(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 5), wood, x, 1.0, z).rotation.z = 0.15;
      for (let k = 0; k < 5; k++) {
        const leaf = add(new THREE.ConeGeometry(0.12, 0.9, 4), dark, x + 0.08, 1.6, z);
        leaf.rotation.set(Math.PI / 2.4, (k / 5) * Math.PI * 2, 0, 'YXZ');
        leaf.translateY(0.38);
      }
    };

    switch (scene) {
      case 'floating-islands': {
        // phumdis: rings of floating plants on the lake around the island
        const ring = mat(0x86ae5e);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          const r = radius + 0.9 + (k % 2) * 0.6;
          const m = add(new THREE.TorusGeometry(0.32 + (k % 3) * 0.1, 0.1, 5, 14), ring, Math.cos(a) * r, 0.03, Math.sin(a) * r);
          m.rotation.x = Math.PI / 2;
          extras.push((t) => (m.position.y = 0.03 + Math.sin(t * 1.2 + k) * 0.03));
        }
        tree(-0.4, 0.2, 0.9);
        tree(0.6, -0.3, 0.8);
        break;
      }
      case 'clear-river': {
        add(new THREE.ConeGeometry(0.9, 1.3, 6), dark, -0.6, 0.8, -0.3);
        add(new THREE.ConeGeometry(0.75, 1.1, 6), grass, 0.7, 0.7, -0.4);
        const canoe = add(new THREE.BoxGeometry(0.6, 0.1, 0.18), wood, radius + 0.7, 0.05, 0.6);
        extras.push((t) => {
          canoe.position.y = 0.05 + Math.sin(t * 1.5) * 0.03;
          canoe.rotation.y = Math.sin(t * 0.3) * 0.3;
        });
        break;
      }
      case 'river-island': {
        const thatch = mat(0x9c7b52);
        for (const [x, z] of [
          [-1.6, 0.3],
          [-0.3, -0.4],
          [1.2, 0.2]
        ] as const) {
          add(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 6), mat(0xc9a66b), x, 0.6, z);
          add(new THREE.ConeGeometry(0.36, 0.35, 6), thatch, x, 0.92, z);
        }
        tree(0.4, 0.5, 0.8);
        tree(-1, -0.5, 0.7);
        const ferry = add(new THREE.BoxGeometry(0.8, 0.14, 0.3), wood, 0, 0.05, radius + 0.8);
        extras.push((t) => (ferry.position.x = Math.sin(t * 0.25) * 2.2));
        break;
      }
      case 'mangroves': {
        const leaf = mat(0x2f5a3c);
        const n = hiQ ? 7 : 5;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const r = radius * (0.55 + (k % 2) * 0.35);
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          for (const s of [-1, 1]) {
            const root = add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), wood, x + s * 0.12, 0.45, z);
            root.rotation.z = s * 0.4;
          }
          add(new THREE.IcosahedronGeometry(0.42, 0), leaf, x, 1.05, z).scale.y = 0.7;
        }
        break;
      }
      case 'lagoon': {
        const bar = add(new THREE.TorusGeometry(radius + 1.4, 0.22, 4, 24, Math.PI * 0.9), sand, 0, 0.02, 0);
        bar.rotation.x = Math.PI / 2;
        bar.rotation.z = -0.4;
        const fin = add(new THREE.ConeGeometry(0.14, 0.32, 4), mat(0x5e6f78, 0.5), 0, 0, 0);
        extras.push((t, r) => {
          const a = t * 0.5;
          fin.position.set(Math.cos(a) * (radius + 0.8), r > 0.5 ? Math.max(-0.2, Math.sin(t * 2.2) * 0.25) : -0.4, Math.sin(a) * (radius + 0.8));
          fin.rotation.y = -a;
        });
        tree(0.2, 0.1, 0.8, grass);
        break;
      }
      case 'backwaters': {
        const paddy = [mat(0x9bcb68), mat(0x7db55b)];
        for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(1.6, 0.04, 0.32), paddy[k % 2]!, 0.2, 0.47, -0.6 + k * 0.34);
        palm(-1.2, 0.4);
        palm(1.3, -0.5);
        palm(0.3, 1.0);
        break;
      }
    }

    // tap target: a generous invisible disc over the whole island
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * stretch + 0.6, radius * stretch + 0.6, 2.5, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.y = 1;
    group.add(hit);

    // fog bank
    const puffs = hiQ ? 26 : 14;
    const pos = new Float32Array(puffs * 3);
    const seed = new Float32Array(puffs);
    for (let k = 0; k < puffs; k++) {
      const a = (k / puffs) * Math.PI * 2 + Math.random() * 0.4;
      const r = radius * stretch * (0.2 + Math.random() * 1.0);
      pos[k * 3] = Math.cos(a) * r;
      pos[k * 3 + 1] = 0.5 + Math.random() * 1.6;
      pos[k * 3 + 2] = Math.sin(a) * r * 0.8;
      seed[k] = Math.random();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const fogMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uLift: { value: 0 }, uDensity: { value: 1 } },
      vertexShader: `uniform float uTime, uLift; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position; p.x += sin(uTime * 0.25 + aSeed * 12.0) * 0.4; p.y += uLift * (2.0 + aSeed * 2.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (3.6 + aSeed * 2.6) * (1.0 + uLift * 0.8) * 520.0 / -mv.z;
          vA = (0.7 + aSeed * 0.3) * (1.0 - uLift); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uDensity; varying float vA;
        void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
          gl_FragColor = vec4(vec3(0.95, 0.97, 0.96), vA * uDensity * smoothstep(0.5, 0.0, r)); ${OUTPUT} }`
    });
    const fog = new THREE.Points(fg, fogMat);
    fog.renderOrder = 5;
    fog.frustumCulled = false;
    fog.raycast = () => {};
    group.add(fog);

    // a few birds circle islands that are out of the fog
    const birds = new THREE.Group();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x13303a });
    for (let k = 0; k < 3; k++) {
      const bird = new THREE.Group();
      const a = (k / 3) * Math.PI * 2;
      bird.position.set(Math.cos(a) * (radius + 0.6), 2.6, Math.sin(a) * (radius + 0.6));
      bird.rotation.y = -a;
      for (const s of [1, -1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.07).translate(0.14 * s, 0, 0), birdMat);
        bird.add(w);
      }
      birds.add(bird);
    }
    birds.visible = false;
    group.add(birds);

    return { group, hit, tints, fog, fogMat, birds, reveal: 0, revealTarget: 0, fogLevel: 1, extras };
  }
}
