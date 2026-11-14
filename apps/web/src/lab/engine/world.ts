/**
 * Spring Hollow: a limestone spring in a forest clearing, late morning. The pool's water
 * level is today's progress, so drinking visibly refills the spring and the hollow grows
 * greener and brighter around it.
 *
 * Everything is modelled procedurally and seeded: terrain, limestone boulders with strata,
 * moss, ferns, grass, lily pads, a bamboo spout, canopy, distant tree lines, light shafts
 * and drifting motes. No downloaded models or textures.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm3, GLSL_NOISE, mulberry32, noise3, smoothstep } from './noise';
import { OUTPUT, SUN_DIR, shared, srgb } from './shared';
import { withEnv } from './materials';
import { fernTexture, leafClusterTexture, treelineTexture } from './textures';

export type Quality = 'high' | 'low';

export const LEVEL_EMPTY = -0.9;
export const LEVEL_FULL = 0;
export const levelFor = (progress: number) =>
  LEVEL_EMPTY + (LEVEL_FULL - LEVEL_EMPTY) * Math.min(1, Math.max(0, progress));

/** Where Buddy sits: the top of a mossy stone near the front of the pool. */
export const SEAT = new THREE.Vector3(-0.45, 0.36, 1.75);
const POOL_Z = 0.2;

function poolRadius(angle: number): number {
  return 3.25 + 0.45 * noise3(Math.cos(angle) * 1.2 + 5, Math.sin(angle) * 1.2, 0.5);
}

export function terrainHeight(x: number, z: number): number {
  const ang = Math.atan2(z - POOL_Z, x);
  const R = poolRadius(ang);
  const r = Math.hypot(x, (z - POOL_Z) * 1.1);
  const s = r / R;
  let y = s < 1 ? -1.25 + 1.1 * s ** 2.2 : -0.15 + 0.55 * smoothstep(1, 1.3, s) + 0.14 * smoothstep(1.3, 2.4, s);
  const back = smoothstep(-2.6, -6.5, z);
  const sideMask = smoothstep(1.2, 4.2, Math.abs(x));
  y += back * (0.7 + 2.9 * sideMask) * (0.8 + 0.5 * (fbm3(x * 0.35, 1.3, z * 0.35) + 0.5));
  const sides = smoothstep(4.8, 8.5, Math.abs(x)) * (1 - smoothstep(3, 8, z));
  y += sides * 2.6 * (0.7 + 0.6 * (fbm3(x * 0.4, 2.1, z * 0.4) + 0.5));
  y += 0.08 * fbm3(x * 1.3, 0.2, z * 1.3, 4) * (s < 1 ? 0.6 : 1);
  y -= smoothstep(5.5, 9, z) * 1.6;
  return y;
}

/** Radius of the water surface at a given level (average over angles). */
export function poolRadiusAtLevel(level: number): number {
  const s = Math.pow(Math.max(0, (level + 1.25) / 1.1), 1 / 2.2);
  return 3.25 * Math.min(1, s);
}

const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
/** Vertex colours are authored in sRGB; three wants them linear. */
const lin = (c: number[]) => c.map((v) => Math.pow(Math.max(0, v), 2.2));

function buildTerrain(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(32, 28, 220, 190);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nrm.getY(i);
    const n = fbm3(x * 0.9, y * 0.9, z * 0.9) + 0.5;
    const sand = lerp3([0.52, 0.48, 0.37], [0.42, 0.41, 0.33], n);
    const deep = lerp3(sand, [0.36, 0.38, 0.32], smoothstep(-0.5, -1.2, y));
    const lime = lerp3([0.74, 0.69, 0.58], [0.6, 0.57, 0.5], n).map(
      (v) => v * (0.86 + 0.14 * Math.sin(y * 11 + n * 4))
    );
    const moss = lerp3([0.2, 0.33, 0.11], [0.36, 0.46, 0.17], smoothstep(0.3, 0.8, n));
    const wet = [0.3, 0.33, 0.25];
    let c: number[];
    if (y < -0.3) c = deep;
    else if (y < 0.12) c = lerp3(deep, wet, smoothstep(-0.3, -0.05, y));
    else c = wet;
    if (y > -0.05) {
      const steep = smoothstep(0.78, 0.55, ny);
      const ground = lerp3(wet, moss, smoothstep(-0.05, 0.25, y));
      c = lerp3(ground, lime, steep * smoothstep(0.1, 0.6, y));
      if (steep > 0.5) c = lerp3(c, moss, smoothstep(0.55, 0.75, n) * smoothstep(0.5, 0.8, ny) * 0.8);
    }
    col.set(lin(c), i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = withEnv(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }), {
    caustics: true,
    wet: true,
    dapple: 1,
    lush: 1,
    bump: { amount: 1.6, freq: 3.2 }
  });
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.name = 'terrain';
  return m;
}

function rockGeometry(
  seed: number,
  scale: THREE.Vector3,
  at: THREE.Vector3,
  rotY: number,
  flatTop: number | null,
  detail = 4
) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const cav = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let d =
      1 +
      0.26 * fbm3(v.x * 1.1 + seed, v.y * 1.1, v.z * 1.1 - seed, 4) +
      0.05 * fbm3(v.x * 4, v.y * 4 + seed, v.z * 4, 2);
    d += 0.035 * Math.sin(v.y * 15 + fbm3(v.x * 2, v.y * 2, v.z * 2 + seed) * 4);
    cav[i] = d;
    v.multiplyScalar(d).multiply(scale);
    if (flatTop !== null && v.y > flatTop) v.y = flatTop + (v.y - flatTop) * 0.12;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.rotateY(rotY);
  g.translate(at.x, at.y, at.z);
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nrm.getY(i);
    const n = fbm3(x * 1.4 + seed, y * 1.4, z * 1.4) + 0.5;
    let c = lerp3([0.76, 0.71, 0.6], [0.58, 0.55, 0.48], n).map((k) => k * (0.85 + 0.15 * Math.sin(y * 13 + n * 5)));
    const mossK = smoothstep(0.35, 0.75, ny) * smoothstep(0.35, 0.6, n + 0.15 * ny);
    c = lerp3(
      c,
      lerp3([0.3, 0.44, 0.15], [0.48, 0.58, 0.22], n),
      Math.min(1, mossK * 1.2) * smoothstep(-0.05, 0.15, y)
    );
    c = lerp3(c, [0.34, 0.37, 0.27], smoothstep(-0.1, -0.5, y) * 0.7);
    // Crevices and the foot of the rock are darker (cheap ambient occlusion).
    const ao =
      (0.62 + 0.38 * smoothstep(0.86, 1.12, cav[i]!)) *
      (0.7 + 0.3 * smoothstep(terrainHeight(x, z) - 0.05, terrainHeight(x, z) + 0.6, y));
    col.set(lin(c.map((k) => k * ao)), i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function buildRocks(): THREE.Group {
  const group = new THREE.Group();
  const mat = withEnv(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }), {
    caustics: true,
    wet: true,
    dapple: 1,
    lush: 1,
    bump: { amount: 2.4, freq: 2.6 }
  });
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const specs: [number, THREE.Vector3, THREE.Vector3, number, number | null][] = [
    [1, V(2.3, 1.7, 1.6), V(-3.6, 0.1, -2.9), 0.4, null],
    [2, V(2.0, 2.4, 1.7), V(3.4, 0.4, -3.2), -0.3, null],
    [3, V(1.5, 1.0, 1.3), V(-4.4, -0.1, 0.4), 0.9, null],
    [4, V(1.3, 0.85, 1.2), V(4.3, -0.15, 0.2), 0.2, null],
    [5, V(1.05, 1.35, 0.85), V(SEAT.x + 0.05, -0.72, SEAT.z - 0.1), 0.5, 0.8],
    [6, V(0.9, 0.55, 0.8), V(-2.9, -0.1, 3.5), 1.2, null],
    [7, V(0.75, 0.6, 0.7), V(2.6, -0.4, 2.5), 0.2, null],
    [8, V(1.6, 1.3, 1.4), V(-1.2, 0.0, -4.2), 0.1, null],
    [9, V(0.5, 0.42, 0.45), V(1.7, -0.6, 0.6), 0.6, null]
  ];
  for (const [seed, sc, at, ry, flat] of specs) {
    const g = rockGeometry(seed * 3.7, sc, at, ry, flat !== null ? flat * sc.y : null, seed === 5 ? 5 : 4);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = seed === 5 ? 'seat' : 'rock';
    group.add(m);
  }
  return group;
}

function buildPebbles(count: number): THREE.InstancedMesh {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const d = 1 + 0.15 * noise3(p.getX(i) * 2, p.getY(i) * 2, p.getZ(i) * 2);
    p.setXYZ(i, p.getX(i) * d, p.getY(i) * d * 0.55, p.getZ(i) * d);
  }
  g.computeVertexNormals();
  const mat = withEnv(new THREE.MeshStandardMaterial({ roughness: 0.55 }), { caustics: true, wet: true });
  const im = new THREE.InstancedMesh(g, mat, count);
  const r = mulberry32(42);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const palette = [0x9a8a72, 0x77736a, 0xb3a68f, 0x5d5a52, 0x8f7158, 0xa6967e];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 3.0;
    const x = Math.cos(a) * d;
    const z = (Math.sin(a) * d) / 1.1 + POOL_Z;
    const s = 0.04 + r() ** 2 * 0.13;
    q.setFromEuler(new THREE.Euler(r() * 0.3, r() * 6.28, r() * 0.3));
    m.compose(
      new THREE.Vector3(x, terrainHeight(x, z) + s * 0.25, z),
      q,
      new THREE.Vector3(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5))
    );
    im.setMatrixAt(i, m);
    im.setColorAt(i, new THREE.Color(palette[Math.floor(r() * palette.length)]!).multiplyScalar(0.85 + r() * 0.3));
  }
  im.receiveShadow = true;
  return im;
}

function bladeGeometry(): THREE.BufferGeometry {
  const segs = 4;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.022 * (1 - t) + 0.002;
    const bend = 0.08 * t * t;
    pos.push(-w, t * 0.4, bend, w, t * 0.4, bend);
    const c = lin([0.16 + 0.24 * t, 0.26 + 0.26 * t, 0.08 + 0.08 * t]);
    col.push(...c, ...c);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Bank spots: above the water, not too steep, and keeping the view to Buddy clear. */
function bankSpot(r: () => number, nearWater: boolean): THREE.Vector3 | null {
  const a = r() * Math.PI * 2;
  const R = poolRadius(a);
  const d = nearWater ? R * (1.0 + r() * 0.22) : R * (1.05 + r() * 1.2);
  const x = Math.cos(a) * d;
  const z = (Math.sin(a) * d) / 1.1 + POOL_Z;
  const y = terrainHeight(x, z);
  if (y < 0.04) return null;
  if (z > 3.2 && Math.abs(x) < 2.6) return null;
  const e = 0.05;
  const slope =
    Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) /
    (2 * e);
  if (slope > 0.9) return null;
  return new THREE.Vector3(x, y, z);
}

/** Sedges at the water's edge: tall, narrow and bluer than the bank grass. */
function buildReeds(count: number): THREE.InstancedMesh {
  const segs = 5;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.014 * (1 - t) + 0.0015;
    const bend = 0.14 * t * t;
    pos.push(-w, t * 0.95, bend, w, t * 0.95, bend);
    const c = lin([0.2 + 0.2 * t, 0.32 + 0.2 * t, 0.2 + 0.08 * t]);
    col.push(...c, ...c);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = withEnv(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), {
    dapple: 1,
    translucent: 0.5,
    sway: { amount: 0.05, height: 0.95 },
    lush: 1
  });
  const im = new THREE.InstancedMesh(g, mat, count);
  const r = mulberry32(13);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 10; tries++) {
    const a = r() * Math.PI * 2;
    const R = poolRadius(a);
    const d = R * (0.88 + r() * 0.2);
    const x = Math.cos(a) * d;
    const z = (Math.sin(a) * d) / 1.1 + POOL_Z;
    if (z > 2.4 && Math.abs(x) < 2.4) continue; // keep the view to Ripple clear
    if (Math.hypot(x - SEAT.x, z - SEAT.z) < 1.2) continue;
    const y = terrainHeight(x, z);
    // A clump of 6 to 10 stems.
    const k = 6 + Math.floor(r() * 5);
    for (let j = 0; j < k && n < count; j++) {
      const s = 0.7 + r() * 0.7;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.35, r() * 6.28, (r() - 0.5) * 0.35));
      m.compose(
        new THREE.Vector3(x + (r() - 0.5) * 0.25, y - 0.05, z + (r() - 0.5) * 0.25),
        q,
        new THREE.Vector3(s, s * (0.8 + r() * 0.6), s)
      );
      im.setMatrixAt(n++, m);
    }
  }
  im.count = n;
  im.receiveShadow = true;
  return im;
}

/** Small flowers scattered on the banks: crossed cards, three colours. */
function buildFlowers(count: number): THREE.InstancedMesh {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#4c7a33';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(S / 2, S);
  g.quadraticCurveTo(S / 2 + 6, S * 0.7, S / 2, S * 0.36);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(S / 2 + Math.cos(a) * 15, S * 0.3 + Math.sin(a) * 15, 13, 8, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#f2c94c';
  g.beginPath();
  g.arc(S / 2, S * 0.3, 8, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const a = new THREE.PlaneGeometry(0.16, 0.16);
  a.translate(0, 0.08, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const geo = mergeGeometries([a, b]);
  const mat = withEnv(
    new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
    {
      dapple: 1,
      translucent: 0.4,
      sway: { amount: 0.03, height: 0.16 }
    }
  );
  const im = new THREE.InstancedMesh(geo, mat, count);
  const r = mulberry32(71);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const colours = [srgb(1, 1, 1), srgb(1, 0.95, 0.6), srgb(0.82, 0.74, 1), srgb(1, 0.82, 0.86)];
  let n = 0;
  for (let tries = 0; n < count && tries < count * 10; tries++) {
    const p = bankSpot(r, r() < 0.5);
    if (!p) continue;
    const tint = colours[Math.floor(r() * colours.length)]!;
    for (let j = 0; j < 4 && n < count; j++) {
      const s = 0.6 + r() * 0.6;
      q.setFromEuler(new THREE.Euler(0, r() * 6.28, (r() - 0.5) * 0.3));
      m.compose(
        new THREE.Vector3(p.x + (r() - 0.5) * 0.35, p.y, p.z + (r() - 0.5) * 0.35),
        q,
        new THREE.Vector3(s, s, s)
      );
      im.setMatrixAt(n, m);
      im.setColorAt(n, tint);
      n++;
    }
  }
  im.count = n;
  return im;
}

/** Two slow veils of mist at the back of the hollow: depth between the pond and the trees. */
function buildMist(): THREE.Mesh[] {
  return [
    [0, 1.0, -4.6, 14, 2.2, 0.0],
    [1.5, 1.6, -7.5, 18, 3, 3.0]
  ].map(([x, y, z, w, h, seed]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w!, h!),
      new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uSeed: { value: seed }, uLush: shared.uLush },
        transparent: true,
        depthWrite: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uTime, uSeed, uLush; varying vec2 vUv; ${GLSL_NOISE}
          void main(){
            float n = lab_fbm(vec3(vUv * vec2(3.0, 1.2) + vec2(uTime * 0.012 + uSeed, 0.0), uSeed));
            float a = smoothstep(0.35, 0.75, n) * sin(vUv.y * 3.14159) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
            gl_FragColor = vec4(vec3(0.86, 0.92, 0.86), a * (0.22 + 0.08 * uLush)); ${OUTPUT} }`
      })
    );
    m.position.set(x!, y!, z!);
    m.renderOrder = -2;
    return m;
  });
}

function buildGrass(count: number): THREE.InstancedMesh {
  const mat = withEnv(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }), {
    dapple: 1,
    translucent: 0.6,
    sway: { amount: 0.06, height: 0.4 },
    lush: 1
  });
  const im = new THREE.InstancedMesh(bladeGeometry(), mat, count);
  const r = mulberry32(9);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 8; tries++) {
    const p = bankSpot(r, r() < 0.55);
    if (!p) continue;
    // Tufts: a few blades around each spot.
    for (let k = 0; k < 4 && n < count; k++) {
      const s = 0.6 + r() * 0.9;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5));
      const off = new THREE.Vector3((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12);
      m.compose(p.clone().add(off), q, new THREE.Vector3(s, s * (0.8 + r() * 0.6), s));
      im.setMatrixAt(n++, m);
    }
  }
  im.count = n;
  // Not every blade is the same green: some yellower and drier, some bluer, a few darker.
  const tints = [
    srgb(1, 1, 1),
    srgb(1.08, 1.05, 0.75),
    srgb(0.82, 1, 0.95),
    srgb(0.78, 0.86, 0.74),
    srgb(1.12, 0.98, 0.72)
  ];
  for (let i = 0; i < n; i++) im.setColorAt(i, tints[Math.floor(r() * (r() < 0.9 ? 4 : 5))]!);
  im.castShadow = false;
  im.receiveShadow = true;
  return im;
}

export interface Ferns {
  mesh: THREE.InstancedMesh;
  setLush(l: number): void;
}

function buildFerns(clusters: number, renderer: THREE.WebGLRenderer): Ferns {
  const g = new THREE.PlaneGeometry(0.5, 1.15, 1, 10);
  g.translate(0, 0.575, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / 1.15;
    p.setZ(i, -0.45 * t * t);
    p.setX(i, p.getX(i) * (1 - 0.1 * t));
  }
  g.computeVertexNormals();
  const mat = withEnv(
    new THREE.MeshStandardMaterial({
      map: fernTexture(renderer),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.7,
      alphaToCoverage: true
    }),
    { dapple: 1, translucent: 0.9, sway: { amount: 0.05, height: 1.15 }, lush: 1 }
  );
  const per = 8;
  const im = new THREE.InstancedMesh(g, mat, clusters * per);
  const r = mulberry32(31);
  const fronds: { pos: THREE.Vector3; yaw: number; pitch: number; s: number }[] = [];
  for (let tries = 0; fronds.length < clusters * per && tries < 400; tries++) {
    const c = bankSpot(r, r() < 0.6);
    if (!c) continue;
    const base = r() * 6.28;
    for (let k = 0; k < per; k++) {
      fronds.push({
        pos: c,
        yaw: base + (k / per) * 6.28 + (r() - 0.5) * 0.4,
        pitch: 0.5 + r() * 0.45,
        s: 0.6 + r() * 0.55
      });
    }
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let shown = -1;
  const setLush = (l: number) => {
    if (Math.abs(l - shown) < 0.004) return;
    shown = l;
    fronds.forEach((f, i) => {
      e.set(f.pitch * (1.12 - 0.3 * l), f.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(f.pos, q, new THREE.Vector3(f.s, f.s * (0.85 + 0.2 * l), f.s));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  im.count = fronds.length;
  // Each clump has its own shade, and fronds within it vary a little.
  const fernTints = [srgb(1, 1, 1), srgb(1.1, 1.06, 0.8), srgb(0.84, 1, 0.92), srgb(0.9, 0.95, 0.82)];
  fronds.forEach((_, i) => {
    const base = fernTints[Math.floor(i / per) % fernTints.length]!.clone();
    im.setColorAt(i, base.multiplyScalar(0.9 + r() * 0.2));
  });
  setLush(0);
  im.castShadow = true;
  im.receiveShadow = true;
  return { mesh: im, setLush };
}

function buildCanopy(renderer: THREE.WebGLRenderer, quality: Quality): THREE.Group {
  const group = new THREE.Group();
  const texA = leafClusterTexture(renderer, 3);
  const texB = leafClusterTexture(renderer, 8);
  const make = (tex: THREE.Texture, tint: number) =>
    withEnv(
      new THREE.MeshStandardMaterial({
        map: tex,
        color: tint,
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        roughness: 0.8,
        alphaToCoverage: true
      }),
      { dapple: 0.5, translucent: 1.1, sway: { amount: 0.12, height: 1.3, sign: -1 }, lush: 1 }
    );
  const mats = [make(texA, 0xffffff), make(texB, 0xe8f0e0), make(texA, 0x8a9a80)];
  const geo = new THREE.PlaneGeometry(2.6, 2.6);
  const r = mulberry32(77);
  const cards: [number, number, number, number, number][] = [];
  // Along the cliff tops and up into the canopy.
  for (let i = 0; i < (quality === 'high' ? 26 : 16); i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (2.5 + r() * 4.5);
    const z = -5.5 + r() * 6;
    cards.push([x, terrainHeight(x, z) + 0.6 + r() * 1.4, z, 0.8 + r() * 0.9, r() < 0.5 ? 0 : 1]);
  }
  for (let i = 0; i < 9; i++) {
    const x = -6 + i * 1.5 + (r() - 0.5);
    cards.push([x, 5.4 + r() * 1.2, -4 + r() * 3, 1.2 + r() * 0.6, i % 2]);
  }
  // One instanced mesh per material: three draw calls per pass instead of about forty.
  const placed: { k: number; m: THREE.Matrix4 }[] = [];
  const o = new THREE.Object3D();
  const put = (k: number) => {
    o.updateMatrix();
    placed.push({ k, m: o.matrix.clone() });
  };
  for (const [x, y, z, s, k] of cards) {
    o.position.set(x, y, z);
    o.rotation.set((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6);
    o.scale.setScalar(s);
    put(k);
  }
  // Big dark leaves close to the camera at the top corners: framing and parallax.
  for (const [x, y, z, s, ry] of [
    [-3.3, 3.9, 3.6, 1.6, 0.6],
    [3.6, 4.1, 3.2, 1.8, -0.5],
    [-0.4, 4.9, 2.6, 1.4, 0.1]
  ] as const) {
    o.position.set(x, y, z);
    o.rotation.set(-0.9, ry, 0.2);
    o.scale.setScalar(s);
    put(2);
  }
  mats.forEach((mat, k) => {
    const mine = placed.filter((p) => p.k === k);
    if (!mine.length) return;
    const inst = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach((p, i) => inst.setMatrixAt(i, p.m));
    inst.castShadow = true;
    group.add(inst);
  });
  return group;
}

function buildSky(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(70, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSunDir: shared.uSunDir, uLush: shared.uLush },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uSunDir; uniform float uLush; varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 hor = vec3(1.0, 0.93, 0.78);
          vec3 top = vec3(0.42, 0.66, 0.86);
          vec3 c = mix(hor, top, smoothstep(0.0, 0.55, h));
          c = mix(vec3(0.62, 0.7, 0.58), c, smoothstep(-0.2, 0.05, h));
          float s = max(dot(vP, uSunDir), 0.0);
          c += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.5 + pow(s, 300.0) * 3.0) * (0.85 + 0.25 * uLush);
          gl_FragColor = vec4(c, 1.0); ${OUTPUT} }`
    })
  );
}

function buildDistance(): THREE.Group {
  const group = new THREE.Group();
  // Far, middle and near tree lines: each bluer and paler with distance.
  const layers: [string, string, number, number, number, number][] = [
    ['#9fbab0', '#a9c0b0', -26, 7.5, 80, 3.2],
    ['#7b9a82', '#86a088', -18, 5.2, 60, 2.2],
    ['#58784f', '#62805a', -11.5, 3.6, 40, 1.3]
  ];
  layers.forEach(([top, bottom, z, h, w, y], i) => {
    const t = treelineTexture(top, bottom, 5 + i * 7);
    t.repeat.x = w / 16;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false })
    );
    m.position.set(0, y, z);
    m.renderOrder = -10 + i;
    group.add(m);
  });
  return group;
}

export interface Shafts {
  mesh: THREE.Mesh;
  starts: THREE.Vector3[];
  dir: THREE.Vector3;
  intensity: { value: number };
}

function buildShafts(): Shafts {
  const dir = SUN_DIR.clone().negate();
  const targets = [
    [-1.6, -0.6],
    [-0.4, -1.5],
    [0.9, 0.1],
    [-2.3, 0.9],
    [1.9, -1.9],
    [0.2, 1.2],
    [-0.9, 2.6]
  ];
  const widths = [0.8, 0.5, 1.0, 0.45, 0.7, 0.6, 0.4];
  const starts = targets.map(([x, z]) => new THREE.Vector3(x, 0, z).addScaledVector(dir, -8.5));
  const pos: number[] = [];
  const shaft: number[] = [];
  const idx: number[] = [];
  starts.forEach((s, k) => {
    const base = k * 4;
    for (const [u, t] of [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1]
    ] as const) {
      pos.push(u, t, 0);
      shaft.push(s.x, s.y, s.z, widths[k]!);
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aShaft', new THREE.Float32BufferAttribute(shaft, 4));
  g.setIndex(idx);
  const intensity = { value: 0.5 };
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDir: { value: dir },
      uTime: shared.uTime,
      uI: intensity,
      uLevel: shared.uLevel,
      uSunColor: shared.uSunColor
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aShaft; uniform vec3 uDir; varying vec2 vUv; varying float vY; varying float vSeed;
      void main(){
        float len = 10.0;
        vec3 c = aShaft.xyz + uDir * position.y * len;
        vec3 view = normalize(cameraPosition - c);
        vec3 side = normalize(cross(uDir, view));
        float w = aShaft.w * (0.55 + 0.75 * position.y);
        vec3 p = c + side * position.x * w;
        vUv = vec2(position.x, position.y); vY = p.y; vSeed = aShaft.x * 3.1 + aShaft.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uI, uLevel; uniform vec3 uSunColor; varying vec2 vUv; varying float vY; varying float vSeed;
      void main(){
        float across = 1.0 - abs(vUv.x); across *= across;
        across *= 0.7 + 0.3 * (sin(vUv.x * 3.0 + vSeed) * 0.5 + 0.5);
        float along = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
        float flick = 0.65 + 0.35 * sin(uTime * 0.45 + vSeed) * sin(uTime * 0.23 + vSeed * 1.7 + vUv.x * 2.0);
        float under = smoothstep(uLevel - 0.25, uLevel + 0.5, vY);
        float a = across * along * flick * under * uI * 0.11;
        gl_FragColor = vec4(uSunColor * vec3(1.0, 0.95, 0.8) * a, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh, starts, dir, intensity };
}

function buildMotes(count: number, shafts: Shafts): THREE.Points {
  const r = mulberry32(55);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * 10;
    pos[i * 3 + 1] = 0.1 + r() * 4.2;
    pos[i * 3 + 2] = -3.5 + r() * 7;
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uPx: { value: 1 },
      uStarts: { value: shafts.starts },
      uDir: { value: shafts.dir },
      uLush: shared.uLush,
      uMotion: { value: 1 },
      uSwirl: { value: new THREE.Vector4(0, 0, 0, 0) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime, uPx, uLush, uMotion; uniform vec3 uStarts[7]; uniform vec3 uDir; uniform vec4 uSwirl;
      varying float vA;
      void main(){
        float t = uTime * uMotion;
        vec3 p = position;
        p.x += sin(t * 0.21 + aSeed * 40.0) * 0.35 + sin(t * 0.07 + aSeed * 9.0) * 0.6;
        p.y += sin(t * 0.17 + aSeed * 23.0) * 0.25 + mod(t * 0.03 + aSeed * 4.0, 1.0) * 0.3;
        p.z += cos(t * 0.19 + aSeed * 31.0) * 0.35;
        // A gentle swirl around the pour when water lands.
        vec3 d = p - uSwirl.xyz; float sw = uSwirl.w * exp(-dot(d, d) * 0.6);
        p.xz += vec2(-d.z, d.x) * sw * 0.6; p.y += sw * 0.15;
        float glow = 0.0;
        for (int i = 0; i < 7; i++) { vec3 q = p - uStarts[i]; glow = max(glow, exp(-dot(cross(q, uDir), cross(q, uDir)) * 3.0)); }
        float tw = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 50.0);
        vA = (0.18 + glow * 0.9) * tw * (0.6 + 0.6 * uLush);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.022 + aSeed * 0.02) * uPx / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, d)); a *= a;
        gl_FragColor = vec4(vec3(1.0, 0.94, 0.78) * a * vA, 1.0); }`
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

export interface Spout {
  group: THREE.Group;
  mouth: THREE.Vector3;
  dir: THREE.Vector3;
  /** Nudge it (it dips a little as water rushes through). */
  kick(amount: number): void;
  update(dt: number): void;
}

function buildSpout(): Spout {
  const group = new THREE.Group();
  const base = new THREE.Vector3(2.75, 1.62, -2.35);
  const target = new THREE.Vector3(1.55, 1.25, -1.35);
  const dir = target.clone().sub(base).normalize();
  const len = 1.45;
  const bamboo = withEnv(new THREE.MeshStandardMaterial({ color: srgb(0.6, 0.58, 0.3), roughness: 0.42 }), {
    dapple: 1,
    wet: true
  });
  const pivot = new THREE.Group();
  pivot.position.copy(base);
  pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  group.add(pivot);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.082, len, 24, 1, true), bamboo);
  tube.position.y = len / 2;
  tube.castShadow = true;
  pivot.add(tube);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.072, 24), new THREE.MeshBasicMaterial({ color: 0x1a2416 }));
  inner.position.y = len - 0.005;
  inner.rotation.x = -Math.PI / 2;
  pivot.add(inner);
  for (const t of [0.35, 0.8, 1.2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), bamboo);
    ring.position.y = t;
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);
  }
  // A forked stick holds it up.
  const wood = withEnv(new THREE.MeshStandardMaterial({ color: srgb(0.36, 0.27, 0.19), roughness: 0.9 }), {
    dapple: 1
  });
  const mid = base.clone().addScaledVector(dir, len * 0.72);
  for (const s of [-1, 1]) {
    const foot = new THREE.Vector3(mid.x + s * 0.18, terrainHeight(mid.x + s * 0.18, mid.z - 0.25) - 0.1, mid.z - 0.25);
    const top = mid.clone().add(new THREE.Vector3(s * 0.05, -0.06, 0));
    const curve = new THREE.LineCurve3(foot, top);
    const stick = new THREE.Mesh(new THREE.TubeGeometry(curve, 2, 0.028, 6), wood);
    stick.castShadow = true;
    group.add(stick);
  }
  const mouth = base.clone().addScaledVector(dir, len);
  let kick = 0;
  let kv = 0;
  return {
    group,
    mouth,
    dir,
    kick(a) {
      kv += a;
    },
    update(dt) {
      kv += (-kick * 90 - kv * 7) * dt;
      kick += kv * dt;
      pivot.rotation.z = 0;
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      pivot.rotateX(kick * 0.05);
    }
  };
}

export interface World {
  group: THREE.Group;
  terrain: THREE.Mesh;
  seat: THREE.Object3D;
  ferns: Ferns;
  grass: THREE.InstancedMesh;
  canopy: THREE.Group;
  shafts: Shafts;
  motes: THREE.Points;
  spout: Spout;
  rustlables: THREE.Material[];
  /**
   * Everything that stands clear of the water. The refraction pass (what's seen *through* the
   * surface) never shows these, so it skips them: fewer draw calls and less overdraw.
   */
  aboveWater: THREE.Object3D[];
  update(dt: number, camera: THREE.PerspectiveCamera, px: number): void;
}

export function buildWorld(renderer: THREE.WebGLRenderer, quality: Quality): World {
  const group = new THREE.Group();
  const sky = buildSky();
  group.add(sky);
  const distance = buildDistance();
  group.add(distance);
  const terrain = buildTerrain();
  group.add(terrain);
  const rocks = buildRocks();
  group.add(rocks);
  const seat = rocks.children.find((c) => c.name === 'seat')!;
  group.add(buildPebbles(quality === 'high' ? 160 : 80));
  const grass = buildGrass(quality === 'high' ? 1800 : 800);
  group.add(grass);
  const reeds = buildReeds(quality === 'high' ? 260 : 120);
  group.add(reeds);
  const flowers = buildFlowers(quality === 'high' ? 220 : 100);
  group.add(flowers);
  const mists = buildMist();
  for (const mist of mists) group.add(mist);
  const ferns = buildFerns(quality === 'high' ? 16 : 10, renderer);
  group.add(ferns.mesh);
  const canopy = buildCanopy(renderer, quality);
  group.add(canopy);
  const shafts = buildShafts();
  group.add(shafts.mesh);
  // Enough motes to catch the light in the shafts, few enough not to read as noise.
  const motes = buildMotes(quality === 'high' ? 240 : 120, shafts);
  group.add(motes);
  const spout = buildSpout();
  group.add(spout.group);

  // Light: warm sun from behind-left (shadows), cool sky fill, a soft bounce from the front.
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.88, 0.7), 3.7);
  sun.position.copy(SUN_DIR).multiplyScalar(14);
  sun.target.position.set(0, 0, 0.5);
  sun.castShadow = true;
  const sz = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(sz, sz);
  const cam = sun.shadow.camera;
  cam.left = -7;
  cam.right = 7;
  cam.top = 7;
  cam.bottom = -7;
  cam.near = 2;
  cam.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  cam.layers.enable(2);
  group.add(sun, sun.target);
  group.add(new THREE.HemisphereLight(new THREE.Color(0.75, 0.88, 0.95), new THREE.Color(0.32, 0.36, 0.2), 0.85));
  const bounce = new THREE.DirectionalLight(new THREE.Color(0.85, 0.95, 1.0), 0.7);
  bounce.position.set(1.5, 2.5, 6);
  group.add(bounce);

  // Lights reach every render layer (Bloop's face is drawn in its own pass).
  group.traverse((o) => {
    if ((o as THREE.Light).isLight) o.layers.enableAll();
  });

  const rustlables = [
    reeds.material as THREE.Material,
    flowers.material as THREE.Material,
    grass.material as THREE.Material,
    ferns.mesh.material as THREE.Material
  ];

  return {
    group,
    terrain,
    seat,
    ferns,
    grass,
    canopy,
    shafts,
    motes,
    spout,
    rustlables,
    aboveWater: [sky, distance, canopy, grass, flowers, ferns.mesh, shafts.mesh, motes, ...mists],
    update(dt, _camera, px) {
      ((motes.material as THREE.ShaderMaterial).uniforms.uPx as { value: number }).value = px;
      spout.update(dt);
    }
  };
}
