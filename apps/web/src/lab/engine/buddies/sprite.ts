/**
 * Ripple: the approved Buddy, as an IMAGE-BASED RECONSTRUCTION. The team's concept was made
 * in Tripo; we do not have that model's GLB. This character is modelled from scratch in code,
 * matched by eye to the concept's turnaround videos. It is not the Tripo asset.
 *
 * Anatomy matched from the references:
 *  - a big round head with huge glossy deep-blue eyes set in soft lids, a snout bump, a smile,
 *  - a frilled wave crest that rolls back over the head and curls at the tip, with
 *    violet-tipped bubble antennae,
 *  - large ribbed translucent fin-wings at the sides of the head, small cheek fins,
 *  - a seahorse S-curve body with a lighter chest plate and stubby bubble-handed arms,
 *  - a long tail that loops forward to one side and ends in a ruffled fan fin,
 *  - translucent turquoise shading to deep ocean blue, with a soft inner glow and water beads.
 *
 * It is rigged: the body is a SkinnedMesh on an 8-bone spine, the eyes turn and saccade, the
 * lids blink and close into happy arcs, the mouth has smile/open/round morph targets, and a
 * spring-based motion layer (RippleMotion) adds follow-through and secondary motion so it
 * never moves rigidly. Materials are standard glTF PBR (transmission, volume, clearcoat,
 * iridescence), so it exports to GLB with skeleton, morphs and animations.
 */
import * as THREE from 'three';
import { GLSL_NOISE, mulberry32 } from '../noise';
import { shared, srgb } from '../shared';
import type { Pose } from '../animator';
import type { Buddy, BuddyContext } from './types';
import { Rig, disposeTree } from './rig';

const HEAD = new THREE.Vector3(0, 0.72, 0);
const HEAD_R = new THREE.Vector3(0.37, 0.33, 0.32);

/** The spine: from inside the head, down a seahorse belly, then a tail that loops forward. */
const SPINE = new THREE.CatmullRomCurve3(
  [
    [0, 0.62, -0.03],
    [0, 0.48, 0.02],
    [0, 0.34, 0.035],
    [0.01, 0.2, 0],
    [0.05, 0.08, -0.07],
    [0.15, 0.0, -0.07],
    [0.27, 0.02, 0.0],
    [0.34, 0.11, 0.07],
    [0.35, 0.22, 0.12],
    [0.3, 0.29, 0.15]
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  'centripetal'
);
const BONE_T = [0, 0.18, 0.34, 0.48, 0.6, 0.72, 0.86, 1];

function radius(t: number): number {
  // Wide where it meets the head (no neck), a round belly, then a long taper to the tail.
  if (t < 0.36) {
    const u = Math.min(1, t / 0.36);
    return 0.27 - 0.06 * Math.sin(u * Math.PI * 0.5) + 0.025 * Math.sin(u * Math.PI);
  }
  return 0.03 + 0.18 * Math.pow(1 - (t - 0.36) / 0.64, 1.2);
}

/** Point on the head's surface in a direction (ellipsoid), and its normal. */
function headSurface(dir: THREE.Vector3): { p: THREE.Vector3; n: THREE.Vector3 } {
  const d = dir.clone().normalize();
  const k = 1 / Math.sqrt((d.x / HEAD_R.x) ** 2 + (d.y / HEAD_R.y) ** 2 + (d.z / HEAD_R.z) ** 2);
  const p = d.multiplyScalar(k).add(HEAD);
  const n = new THREE.Vector3(
    (p.x - HEAD.x) / HEAD_R.x ** 2,
    (p.y - HEAD.y) / HEAD_R.y ** 2,
    (p.z - HEAD.z) / HEAD_R.z ** 2
  ).normalize();
  return { p, n };
}

/** Bright turquoise at the head to deep ocean blue at the tail tip. */
function bodyColor(t: number): THREE.Color {
  const a = srgb(0.2, 0.84, 0.84);
  const b = srgb(0.12, 0.66, 0.86);
  const c = srgb(0.08, 0.3, 0.82);
  return t < 0.3 ? a.clone().lerp(b, t / 0.3) : b.clone().lerp(c, Math.min(1, (t - 0.3) / 0.6));
}

export type SpriteQuality = 'high' | 'low';

/**
 * Liquid skin. On capable devices it transmits light (you see the inner glow and the world
 * through it, tinted by its own volume); on low-end phones it falls back to an opaque
 * clearcoat with a stronger emissive so it still reads as glowing water.
 */
function liquid(
  q: SpriteQuality,
  o: { color?: THREE.Color; vertexColors?: boolean; transmission?: number; thickness?: number; emissive?: number }
) {
  const hi = q === 'high';
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color ?? new THREE.Color(1, 1, 1),
    vertexColors: o.vertexColors ?? false,
    roughness: 0.1,
    metalness: 0,
    transmission: hi ? (o.transmission ?? 0.55) : 0,
    thickness: o.thickness ?? 0.4,
    ior: 1.33,
    attenuationColor: srgb(0.04, 0.42, 0.55),
    attenuationDistance: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    iridescence: 0.35,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [180, 480],
    specularIntensity: 1,
    emissive: srgb(0.02, 0.26, 0.3),
    emissiveIntensity: (o.emissive ?? 0.25) * (hi ? 1 : 1.8),
    envMapIntensity: 1.35
  });
  return addLiquidLook(m);
}

/**
 * The liquid look, layered onto three's physical material so lighting, shadows and the
 * transmission stay correct:
 *  - a fresnel rim that glows at grazing angles, like the edge of a water drop,
 *  - slow caustic shimmer drifting through the body,
 *  - rippling light thrown up from the pond onto Ripple's underside.
 */
function addLiquidLook(m: THREE.MeshPhysicalMaterial, rim = 1) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uLevel = shared.uLevel;
    sh.uniforms.uRimK = { value: rim };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRipW;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvRipW = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uTime, uLevel, uRimK;\nvarying vec3 vRipW;\n${GLSL_NOISE}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float rN = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float rim = pow(1.0 - rN, 3.0) * uRimK;
          float shimmer = lab_caustic(vRipW.xy * 7.0 + vec2(uTime * 0.12, vRipW.z * 4.0), uTime * 0.55);
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          float under = clamp(-wn.y * 0.6 + 0.4, 0.0, 1.0) * (1.0 - smoothstep(uLevel + 0.4, uLevel + 2.2, vRipW.y));
          float bounce = lab_caustic(vRipW.xz * 5.0 + vec2(uTime * 0.08, 0.0), uTime * 0.9);
          totalEmissiveRadiance += vec3(0.4, 0.92, 1.0) * rim * 0.3
            + vec3(0.4, 0.9, 0.9) * shimmer * 0.06
            + vec3(0.6, 0.95, 0.85) * bounce * under * 0.28;
        }`
      );
  };
  m.customProgramCacheKey = () => `ripple-liquid-${m.transmission > 0 ? 't' : 'o'}-${rim}`;
  return m;
}

/** The skinned body: a tube along the spine with a varying radius, weighted to the bones. */
function buildBody(mat: THREE.Material, q: SpriteQuality) {
  const S = q === 'high' ? 120 : 80;
  const R = q === 'high' ? 40 : 28;
  const frames = SPINE.computeFrenetFrames(S, false);
  const pos: number[] = [];
  const col: number[] = [];
  const skinI: number[] = [];
  const skinW: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const P = SPINE.getPointAt(t);
    const N = frames.normals[i]!;
    const B = frames.binormals[i]!;
    const r = radius(t);
    const c = bodyColor(t);
    let k = 0;
    while (k < BONE_T.length - 2 && t > BONE_T[k + 1]!) k++;
    const w = THREE.MathUtils.smoothstep((t - BONE_T[k]!) / (BONE_T[k + 1]! - BONE_T[k]!), 0, 1);
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2;
      const dir = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      // A seahorse belly bulges forward; soft ridges ring the tail.
      const bulge = 1 + 0.13 * Math.max(0, dir.z) * Math.sin(Math.min(1, t / 0.5) * Math.PI);
      const ridge = t > 0.4 ? 1 + 0.06 * Math.max(0, Math.sin(t * 70)) : 1;
      const v = P.clone().addScaledVector(dir, r * bulge * ridge);
      pos.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
      skinI.push(k, k + 1, 0, 0);
      skinW.push(1 - w, w, 0, 0);
      if (i < S && j < R) {
        const a0 = i * (R + 1) + j;
        const b0 = a0 + R + 1;
        idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
    }
  }
  const tipI = pos.length / 3;
  const tip = SPINE.getPointAt(1).addScaledVector(SPINE.getTangentAt(1), 0.025);
  pos.push(tip.x, tip.y, tip.z);
  const tc = bodyColor(1);
  col.push(tc.r, tc.g, tc.b);
  skinI.push(BONE_T.length - 1, 0, 0, 0);
  skinW.push(1, 0, 0, 0);
  for (let j = 0; j < R; j++) idx.push(S * (R + 1) + j, tipI, S * (R + 1) + j + 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  g.setIndex(idx);
  g.computeVertexNormals();

  const bones: THREE.Bone[] = [];
  let prev = new THREE.Vector3();
  BONE_T.forEach((t, i) => {
    const b = new THREE.Bone();
    b.name = `spine_${i}`;
    const p = SPINE.getPointAt(t);
    b.position.copy(p.clone().sub(prev));
    prev = p;
    if (i > 0) bones[i - 1]!.add(b);
    bones.push(b);
  });
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.name = 'body';
  mesh.add(bones[0]!);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return { mesh, bones, frames };
}

/** A tube along a curve whose radius eases from r0 to r1, with a rounded tip. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, S = 48, R = 20): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(S, false);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const P = curve.getPointAt(t);
    const r = (r0 + (r1 - r0) * Math.pow(t, 0.8)) * (i === S ? 0.2 : i === S - 1 ? 0.7 : 1);
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2;
      const d = frames.normals[i]!.clone()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(frames.binormals[i]!, Math.sin(a));
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r);
      if (i < S && j < R) {
        const a0 = i * (R + 1) + j;
        idx.push(a0, a0 + R + 1, a0 + 1, a0 + 1, a0 + R + 1, a0 + R + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The crest: a thin frill whose top edge rolls in three waves and curls over at the back. */
function crestGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.21, -0.03);
  s.bezierCurveTo(0.22, 0.06, 0.19, 0.15, 0.13, 0.18);
  s.bezierCurveTo(0.09, 0.2, 0.07, 0.13, 0.04, 0.14);
  s.bezierCurveTo(0.02, 0.2, -0.02, 0.27, -0.07, 0.26);
  s.bezierCurveTo(-0.1, 0.25, -0.1, 0.18, -0.13, 0.19);
  s.bezierCurveTo(-0.17, 0.27, -0.25, 0.31, -0.31, 0.25);
  s.bezierCurveTo(-0.35, 0.2, -0.32, 0.12, -0.26, 0.13);
  s.bezierCurveTo(-0.22, 0.14, -0.22, 0.19, -0.25, 0.19);
  s.bezierCurveTo(-0.21, 0.12, -0.27, 0.04, -0.27, -0.03);
  s.lineTo(0.21, -0.03);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.03,
    bevelSegments: 4,
    curveSegments: 14
  });
  g.translate(0, 0, -0.05);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // Thinner toward the free edge, and bent so the base hugs the curve of the head.
    const thin = 1 - 0.35 * THREE.MathUtils.clamp(y / 0.26, 0, 1);
    p.setXYZ(i, x, y - x * x * 1.35, z * thin);
  }
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** A ribbed fin texture: radial ribs from the base, a brighter rim, droplet speckle. */
function finTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S * 0.5, S, 10, S * 0.5, S, S * 1.05);
  grad.addColorStop(0, 'rgb(40,170,200)');
  grad.addColorStop(0.7, 'rgb(110,222,228)');
  grad.addColorStop(1, 'rgb(200,252,248)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI * 0.93 + (i / 10) * Math.PI * 0.86;
    g.strokeStyle = 'rgba(25,120,175,0.75)';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(S * 0.5, S);
    g.quadraticCurveTo(
      S * 0.5 + Math.cos(a) * S * 0.35,
      S + Math.sin(a) * S * 0.45,
      S * 0.5 + Math.cos(a) * S * 0.78,
      S + Math.sin(a) * S * 0.98
    );
    g.stroke();
    g.strokeStyle = 'rgba(230,255,255,0.45)';
    g.lineWidth = 2;
    g.stroke();
  }
  const r = mulberry32(3);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(235,255,255,${0.3 + r() * 0.4})`;
    g.beginPath();
    g.arc(r() * S, r() * S * 0.9, 2 + r() * 5, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A rounded, scalloped fan fin in its own XY plane, base at the origin, opening toward +Y. */
function finGeometry(w: number, h: number, scallops = 5): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.1, 0);
  s.bezierCurveTo(-w * 0.55, h * 0.22, -w * 0.64, h * 0.8, -w * 0.42, h);
  for (let i = 0; i < scallops; i++) {
    const x0 = -w * 0.42 + (i / scallops) * w * 0.84;
    const x1 = -w * 0.42 + ((i + 1) / scallops) * w * 0.84;
    s.quadraticCurveTo((x0 + x1) / 2, h * 1.13, x1, h * (i === scallops - 1 ? 1 : 0.97));
  }
  s.bezierCurveTo(w * 0.64, h * 0.8, w * 0.55, h * 0.22, w * 0.1, 0);
  s.lineTo(-w * 0.1, 0);
  const g = new THREE.ShapeGeometry(s, 24);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // Cupped across, curling back toward the tip, with a soft wave in the membrane.
    p.setZ(i, ((x * x) / w) * 0.55 - (y / h) ** 2 * h * 0.16 + Math.sin((x / w) * 9) * 0.008 * (y / h));
    uv.setXY(i, x / (w * 1.32) + 0.5, y / (h * 1.15));
  }
  g.computeVertexNormals();
  return g;
}

/** Fin membrane: thin, transmissive, iridescent; ripples in the vertex shader (live only). */
function finMaterial(q: SpriteQuality, tex: THREE.Texture, flutter: { value: number }) {
  const m = liquid(q, { transmission: 0.75, thickness: 0.03, emissive: 0.2 });
  m.map = tex;
  m.side = THREE.DoubleSide;
  m.iridescence = 0.7;
  if (q === 'low') {
    m.transparent = true;
    m.opacity = 0.82;
    m.depthWrite = false;
  }
  const prevCompile = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prevCompile.call(m, s, r);
    s.uniforms.uTime = shared.uTime;
    s.uniforms.uFlutter = flutter;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uFlutter;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float f = uv.y * uv.y;
          transformed.z += sin(uTime * (3.0 + 4.0 * uFlutter) - uv.y * 7.0 + uv.x * 4.0) * 0.022 * f * (0.6 + uFlutter);
        }`
      );
  };
  m.customProgramCacheKey = () => `ripple-fin-${q}`;
  return m;
}

/** Eye texture, mapped with its pole facing forward: pupil, fibrous blue iris, a dark limbal ring. */
function eyeTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rows: [number, string][] = [
    [0, '#03061f'],
    [0.11, '#050b34'],
    [0.13, '#0f2a8c'],
    [0.2, '#1c4cc7'],
    [0.27, '#3a7ae8'],
    [0.31, '#5b9ef5'],
    [0.34, '#0b1a55'],
    [0.39, '#060f33'],
    [1, '#040921']
  ];
  const grad = g.createLinearGradient(0, 0, 0, H);
  for (const [o, col] of rows) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const r = mulberry32(5);
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    g.strokeStyle = `rgba(${140 + r() * 90},${190 + r() * 60},255,${0.12 + r() * 0.22})`;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, H * 0.125);
    g.lineTo(x + (r() - 0.5) * 6, H * (0.24 + r() * 0.08));
    g.stroke();
  }
  // Light pooling in the lower iris, opposite the highlight (u = 0.5 is the bottom).
  const low = g.createLinearGradient(0, 0, W, 0);
  low.addColorStop(0.25, 'rgba(120,215,255,0)');
  low.addColorStop(0.5, 'rgba(120,215,255,0.55)');
  low.addColorStop(0.75, 'rgba(120,215,255,0)');
  g.fillStyle = low;
  g.fillRect(0, H * 0.15, W, H * 0.17);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface SpriteEye {
  group: THREE.Group;
  ball: THREE.Mesh;
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  /** The ^ line of a happy closed eye, as on the character sheet. */
  arc: THREE.Mesh;
  /** The lash line along a blinking lid, so a blink reads as a blink. */
  lash: THREE.Mesh;
  tex: THREE.Texture;
}

function buildEye(side: number, tex: THREE.Texture, lidMat: THREE.Material, rimMat: THREE.Material): SpriteEye {
  const R = 0.13;
  const s = headSurface(new THREE.Vector3(side * 0.44, 0.1, 0.9));
  const group = new THREE.Group();
  group.name = `eye_${side < 0 ? 'R' : 'L'}`;
  group.position.copy(s.p).addScaledVector(s.n, -R * 0.45);
  group.lookAt(group.position.clone().add(new THREE.Vector3(side * 0.16, 0.02, 1)));
  const geo = new THREE.SphereGeometry(R, 48, 32);
  geo.rotateX(Math.PI / 2);
  // Each eye owns its texture (cloned) so its pupil can dilate on its own.
  const own = tex.clone();
  own.needsUpdate = true;
  const ball = new THREE.Mesh(
    geo,
    new THREE.MeshPhysicalMaterial({
      map: own,
      roughness: 0.03,
      clearcoat: 1,
      clearcoatRoughness: 0.01,
      envMapIntensity: 1.8,
      specularIntensity: 1
    })
  );
  ball.name = `eyeball_${side < 0 ? 'R' : 'L'}`;
  group.add(ball);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [x, y, sz] of [
    [-0.36, 0.38, 0.27],
    [0.32, -0.34, 0.11],
    [0.06, 0.46, 0.07]
  ] as const) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(R * sz, 14, 10), white);
    h.position.set(R * x, R * y, R * 0.95);
    h.scale.z = 0.35;
    group.add(h);
  }
  // A soft rim of skin around the eye: gives it a socket and makes expressions read.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, R * 0.13, 12, 48), rimMat);
  rim.position.z = R * 0.42;
  rim.scale.set(1, 1, 0.8);
  group.add(rim);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
  upper.name = `lid_upper_${side < 0 ? 'R' : 'L'}`;
  const lower = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.07, 40, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    lidMat
  );
  lower.name = `lid_lower_${side < 0 ? 'R' : 'L'}`;
  group.add(upper, lower);
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(R * 0.6, R * 0.1, 10, 32, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x0b1a46, roughness: 0.4 })
  );
  arc.name = `happy_${side < 0 ? 'R' : 'L'}`;
  arc.position.set(0, -R * 0.18, R * 1.2);
  arc.scale.setScalar(0.001);
  group.add(arc);
  const lash = new THREE.Mesh(new THREE.TorusGeometry(R * 0.66, R * 0.05, 8, 28, Math.PI), arc.material);
  lash.name = `lash_${side < 0 ? 'R' : 'L'}`;
  lash.rotation.z = Math.PI;
  lash.position.set(0, R * 0.12, R * 1.17);
  lash.scale.setScalar(0.001);
  group.add(lash);
  return { group, ball, upper, lower, arc, lash, tex: own };
}

/** Mouth as real geometry with smile / open / round morph targets (exports to glTF). */
function buildMouth(width: number): THREE.Mesh {
  const N = 48;
  const shape = (smile: number, open: number, round: number) => {
    const pts: number[] = [0, 0, 0];
    for (let k = 0; k <= N; k++) {
      const a = (k / N) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      const w = 1 - 0.58 * round;
      const h = 0.22 + 0.78 * Math.max(open, round * 0.75);
      let qy = y * h * 0.5 * (y < 0 ? 1 + 0.7 * open * (1 - round) : 1);
      qy += smile * (x * x * w * w - 0.35) * 0.38 * (1 - round);
      pts.push(x * w * width * 0.5, qy * width * 0.5, 0);
    }
    return pts;
  };
  const idx: number[] = [];
  for (let k = 1; k <= N; k++) idx.push(0, k, k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(shape(0.35, 0, 0), 3));
  g.setIndex(idx);
  g.morphAttributes.position = [
    new THREE.Float32BufferAttribute(shape(1, 0, 0), 3),
    new THREE.Float32BufferAttribute(shape(0.35, 1, 0), 3),
    new THREE.Float32BufferAttribute(shape(0, 0, 1), 3)
  ];
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ color: 0x0d1b3d, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  m.name = 'mouth';
  m.morphTargetDictionary = { smile: 0, open: 1, round: 2 };
  m.morphTargetInfluences = [0, 0, 0];
  return m;
}

export interface SpriteParts {
  bones: THREE.Bone[];
  eyes: SpriteEye[];
  mouth: THREE.Mesh;
  fins: THREE.Object3D[];
  cheekFins: THREE.Object3D[];
  arms: THREE.Object3D[];
  tailFan: THREE.Object3D;
  head: THREE.Group;
  crest: THREE.Object3D;
  antennae: THREE.Object3D[];
  chest: THREE.Object3D;
  cores: THREE.Mesh[];
  coreMat: THREE.MeshBasicMaterial;
  flutter: { value: number };
  /** Transmissive meshes, hidden while the water's refraction pass is drawn. */
  liquid: THREE.Object3D[];
}

export function buildSpriteModel(q: SpriteQuality = 'high'): { model: THREE.Group; parts: SpriteParts } {
  const model = new THREE.Group();
  model.name = 'Ripple';
  const skin = liquid(q, { vertexColors: true, transmission: 0.5, thickness: 0.45 });
  const { mesh: body, bones, frames } = buildBody(skin, q);
  model.add(body);

  // Inner glow: soft light cores inside the head and belly, seen through the liquid skin.
  const coreMat = new THREE.MeshBasicMaterial({ color: srgb(0.55, 1, 0.95), toneMapped: false });
  const cores: THREE.Mesh[] = [];
  const coreGeo = new THREE.SphereGeometry(1, 24, 16);
  for (const [p, s] of [
    [HEAD.clone().add(new THREE.Vector3(0, -0.04, -0.06)), new THREE.Vector3(0.2, 0.17, 0.15)],
    [SPINE.getPointAt(0.24), new THREE.Vector3(0.12, 0.13, 0.1)]
  ] as const) {
    const c = new THREE.Mesh(coreGeo, coreMat);
    c.position.copy(p);
    c.scale.copy(s);
    c.visible = q === 'high';
    model.add(c);
    cores.push(c);
  }

  // Head.
  const head = new THREE.Group();
  head.name = 'head';
  model.add(head);
  const headGeo = q === 'high' ? new THREE.SphereGeometry(1, 72, 54) : new THREE.SphereGeometry(1, 48, 36);
  {
    const p = headGeo.attributes.position as THREE.BufferAttribute;
    const col: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      // Full cheeks, a slightly flatter face, and a brow that shades the eyes.
      const cheek = 1 + 0.07 * Math.exp(-((y + 0.25) ** 2) * 8) * Math.max(0, z);
      const brow = 1 + 0.04 * Math.exp(-((y - 0.35) ** 2) * 30) * Math.max(0, z);
      p.setXYZ(i, x * HEAD_R.x * cheek, y * HEAD_R.y, z * HEAD_R.z * cheek * brow);
      const c = srgb(0.2, 0.84, 0.84).lerp(srgb(0.36, 0.9, 0.88), Math.max(0, y) * 0.6);
      col.push(c.r, c.g, c.b);
    }
    headGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    headGeo.translate(HEAD.x, HEAD.y, HEAD.z);
    headGeo.computeVertexNormals();
  }
  const headSkin = liquid(q, { vertexColors: true, transmission: 0.45, thickness: 0.55 });
  const headMesh = new THREE.Mesh(headGeo, headSkin);
  headMesh.name = 'head_shell';
  headMesh.castShadow = true;
  head.add(headMesh);

  // Opaque skin for lids and eye rims (they must hide what's behind them).
  const lidSkin = new THREE.MeshPhysicalMaterial({
    color: srgb(0.22, 0.82, 0.83),
    roughness: 0.25,
    clearcoat: 0.8,
    emissive: srgb(0.02, 0.2, 0.23),
    emissiveIntensity: 0.4,
    envMapIntensity: 1
  });
  const rimSkin = new THREE.MeshPhysicalMaterial({
    color: srgb(0.32, 0.88, 0.86),
    roughness: 0.2,
    clearcoat: 1,
    emissive: srgb(0.02, 0.2, 0.23),
    emissiveIntensity: 0.4
  });

  // Snout and mouth.
  const sn = headSurface(new THREE.Vector3(0, -0.12, 1));
  const snout = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), lidSkin);
  snout.name = 'snout';
  snout.scale.set(0.065, 0.048, 0.05);
  snout.position.copy(sn.p).addScaledVector(sn.n, -0.008);
  head.add(snout);
  const mouth = buildMouth(0.15);
  const ms = headSurface(new THREE.Vector3(0, -0.37, 1));
  mouth.position.copy(ms.p).addScaledVector(ms.n, 0.032);
  mouth.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    ms.n
      .clone()
      .lerp(new THREE.Vector3(0, 0, 1), 0.4)
      .normalize()
  );
  head.add(mouth);

  // Eyes.
  const eyeTex = eyeTexture();
  const eyes = [-1, 1].map((side) => buildEye(side, eyeTex, lidSkin, rimSkin));
  eyes.forEach((e) => head.add(e.group));

  // Crest: the main frill along the top, with a small curl on each side.
  const crestMat = liquid(q, { color: srgb(0.42, 0.95, 0.92), transmission: 0.6, thickness: 0.12, emissive: 0.3 });
  const crest = new THREE.Group();
  crest.name = 'crest';
  const top = headSurface(new THREE.Vector3(0, 1, 0.05));
  crest.position.copy(top.p).add(new THREE.Vector3(0, -0.035, 0));
  const crestGeo = crestGeometry();
  const frill = new THREE.Mesh(crestGeo, crestMat);
  frill.castShadow = true;
  crest.add(frill);
  // Two smaller frills splayed outward: from the front the crest fans like a breaking wave.
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(crestGeo, crestMat);
    f.scale.set(1.0, 0.72, 0.8);
    f.position.set(side * 0.085, -0.035, -0.03);
    f.rotation.z = -side * 0.42;
    f.castShadow = true;
    crest.add(f);
  }
  const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const side of [-1, 1]) {
    const pts = [
      V3(side * 0.09, -0.04, 0.0),
      V3(side * 0.15, 0.06, -0.05),
      V3(side * 0.2, 0.08, -0.15),
      V3(side * 0.19, 0.0, -0.21),
      V3(side * 0.15, -0.01, -0.16)
    ];
    const curl = new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3(pts), 0.045, 0.014), crestMat);
    crest.add(curl);
  }
  head.add(crest);

  // Antennae with violet bead tips.
  const violet = liquid(q, { color: srgb(0.58, 0.5, 0.98), transmission: 0.4, thickness: 0.05, emissive: 0.0 });
  violet.emissive = srgb(0.16, 0.08, 0.4);
  violet.emissiveIntensity = 0.5;
  const antennae: THREE.Object3D[] = [];
  for (const [x, z, len, lean] of [
    [-0.17, 0.08, 0.09, -0.5],
    [0.18, 0.05, 0.1, 0.5],
    [-0.28, -0.06, 0.07, -0.8],
    [0.28, -0.08, 0.07, 0.8]
  ] as const) {
    const base = headSurface(new THREE.Vector3(x, 0.85, z));
    const a = new THREE.Group();
    a.name = `antenna_${antennae.length}`;
    a.position.copy(base.p);
    a.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      base.n
        .clone()
        .add(new THREE.Vector3(lean * 0.3, 0.6, 0))
        .normalize()
    );
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, len, 12), lidSkin);
    stalk.position.y = len / 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 14), violet);
    bead.position.y = len + 0.02;
    a.add(stalk, bead);
    head.add(a);
    antennae.push(a);
  }

  // Fin-wings and cheek fins.
  const flutter = { value: 0 };
  const finMat = finMaterial(q, finTexture(), flutter);
  const bigFin = finGeometry(0.58, 0.46, 5);
  const fins = [-1, 1].map((side) => {
    const root = headSurface(new THREE.Vector3(side, 0.05, -0.35));
    const pivot = new THREE.Group();
    pivot.name = `fin_${side < 0 ? 'R' : 'L'}`;
    pivot.position.copy(root.p).addScaledVector(root.n, -0.04);
    const fin = new THREE.Mesh(bigFin, finMat);
    fin.rotation.set(0, 0, -side * (Math.PI / 2 - 0.3));
    fin.rotateX(-0.4);
    fin.renderOrder = 2;
    fin.castShadow = true;
    pivot.add(fin);
    head.add(pivot);
    return pivot;
  });
  const smallFin = finGeometry(0.15, 0.14, 3);
  const cheekFins = [-1, 1].map((side) => {
    const root = headSurface(new THREE.Vector3(side, -0.25, 0.25));
    const pivot = new THREE.Group();
    pivot.name = `cheekfin_${side < 0 ? 'R' : 'L'}`;
    pivot.position.copy(root.p).addScaledVector(root.n, -0.012);
    const fin = new THREE.Mesh(smallFin, finMat);
    fin.rotation.set(0, side * 0.5, -side * (Math.PI / 2 + 0.2));
    fin.renderOrder = 2;
    pivot.add(fin);
    head.add(pivot);
    return pivot;
  });

  // Chest plate: a lighter, glassier panel.
  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(1, 36, 26),
    liquid(q, { color: srgb(0.5, 0.95, 0.93), transmission: 0.6, thickness: 0.08, emissive: 0.35 })
  );
  chest.name = 'chest';
  chest.scale.set(0.13, 0.16, 0.04);
  const chestP = SPINE.getPointAt(0.24);
  chest.position.set(chestP.x, chestP.y, chestP.z + radius(0.24) * 0.98);
  chest.rotation.x = -0.15;
  model.add(chest);

  // Arms: short, ending in bubble hands.
  const armMat = liquid(q, { color: srgb(0.14, 0.66, 0.84), transmission: 0.4, thickness: 0.1 });
  const handMat = liquid(q, { color: srgb(0.16, 0.5, 0.9), transmission: 0.45, thickness: 0.08 });
  const arms = [-1, 1].map((side) => {
    const p = SPINE.getPointAt(0.2);
    const pivot = new THREE.Group();
    pivot.name = `arm_${side < 0 ? 'R' : 'L'}`;
    pivot.position.set(p.x + side * 0.24, p.y - 0.02, p.z + 0.08);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.09, 8, 14), armMat);
    arm.position.y = -0.065;
    pivot.add(arm);
    const hand = new THREE.Group();
    hand.position.y = -0.14;
    for (const [hx, hy, hz, hr] of [
      [0, 0, 0, 0.054],
      [side * 0.04, -0.022, 0.032, 0.03],
      [-side * 0.012, -0.04, 0.036, 0.026]
    ] as const) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(hr, 18, 12), handMat);
      b.position.set(hx, hy, hz);
      hand.add(b);
    }
    pivot.add(hand);
    model.add(pivot);
    return pivot;
  });

  // Tail fan on the last bone.
  const last = bones[bones.length - 1]!;
  const tailFan = new THREE.Group();
  tailFan.name = 'tail_fan';
  tailFan.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SPINE.getTangentAt(1));
  const fan = new THREE.Mesh(finGeometry(0.4, 0.34, 5), finMat);
  fan.position.y = -0.012;
  fan.rotation.y = 0.9;
  fan.renderOrder = 2;
  fan.castShadow = true;
  tailFan.add(fan);
  last.add(tailFan);

  // Water beads: glassy droplets on the head (instanced) and riding the spine bones.
  const r = mulberry32(17);
  // Beads are bright glossy droplets (not transmissive: at this size they'd just pick up
  // whatever dark rock is behind them).
  const beadClear = new THREE.MeshPhysicalMaterial({
    color: srgb(0.78, 0.98, 1),
    roughness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.0,
    iridescence: 0.5,
    emissive: srgb(0.1, 0.35, 0.4),
    emissiveIntensity: 0.35,
    envMapIntensity: 1.8
  });
  const beadGeo = new THREE.SphereGeometry(1, 16, 12);
  const headBeads: THREE.Matrix4[] = [];
  const violetBeads: THREE.Matrix4[] = [];
  for (let i = 0; i < 90 && headBeads.length < 40; i++) {
    const d = new THREE.Vector3(r() * 2 - 1, r() * 1.6 - 0.5, r() * 2 - 1);
    if (d.z > 0.25 && d.y < 0.55 && d.y > -0.65) continue; // keep the face clear
    const s = headSurface(d);
    const sz = 0.008 + r() ** 2 * 0.028;
    const m = new THREE.Matrix4().compose(
      s.p.clone().addScaledVector(s.n, sz * 0.35),
      new THREE.Quaternion(),
      new THREE.Vector3(sz, sz, sz)
    );
    (r() < 0.12 ? violetBeads : headBeads).push(m);
  }
  const hb = new THREE.InstancedMesh(beadGeo, beadClear, headBeads.length);
  headBeads.forEach((m, i) => hb.setMatrixAt(i, m));
  hb.name = 'beads_head';
  head.add(hb);
  if (violetBeads.length) {
    const vb = new THREE.InstancedMesh(beadGeo, violet, violetBeads.length);
    violetBeads.forEach((m, i) => vb.setMatrixAt(i, m));
    vb.name = 'beads_violet';
    head.add(vb);
  }
  const bonesAt = BONE_T.map((t) => SPINE.getPointAt(t));
  for (let i = 0; i < (q === 'high' ? 52 : 28); i++) {
    const t = 0.1 + r() * 0.88;
    const fi = Math.round(t * (q === 'high' ? 120 : 80));
    const N = frames.normals[fi]!;
    const B = frames.binormals[fi]!;
    const a = r() * Math.PI * 2;
    const dir = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
    if (t < 0.4 && dir.z > 0.55) continue; // not on the chest plate
    const sz = 0.007 + r() ** 2 * (0.03 * (1 - t * 0.5));
    const p = SPINE.getPointAt(t).addScaledVector(dir, radius(t) + sz * 0.3);
    let k = 0;
    while (k < BONE_T.length - 1 && t > (BONE_T[k]! + BONE_T[k + 1]!) / 2) k++;
    const bead = new THREE.Mesh(beadGeo, r() < 0.1 ? violet : beadClear);
    bead.userData.bead = true;
    bead.scale.setScalar(sz);
    bead.position.copy(p.sub(bonesAt[k]!));
    bones[k]!.add(bead);
  }

  const liquidParts: THREE.Object3D[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshPhysicalMaterial;
    // Tiny beads don't need their own shadows; everything else does.
    m.castShadow = !mat.transparent && !m.userData.bead && !(m as THREE.InstancedMesh).isInstancedMesh;
    if (mat.transmission > 0) liquidParts.push(m);
  });
  return {
    model,
    parts: {
      bones,
      eyes,
      mouth,
      fins,
      cheekFins,
      arms,
      tailFan,
      head,
      crest,
      antennae,
      chest,
      cores,
      coreMat,
      flutter,
      liquid: liquidParts
    }
  };
}

/** A damped spring on one number. Semi-implicit Euler: stable at 30-120 Hz. */
class Spring {
  x = 0;
  v = 0;
  constructor(
    private k: number,
    private d: number
  ) {}
  step(target: number, dt: number): number {
    this.v += ((target - this.x) * this.k - this.v * this.d) * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v: number) {
    this.v += v;
  }
}

/**
 * Secondary motion for Ripple: what makes it feel like a living thing in water rather than
 * a puppet. Follow-through on the head and fins, antennae and crest that jiggle a beat late,
 * a tail whose swish grows with excitement, eye saccades, and small idle fidgets.
 */
export class RippleMotion {
  private headX = new Spring(70, 9);
  private headZ = new Spring(60, 8);
  private finL = new Spring(90, 7);
  private finR = new Spring(90, 7);
  private crest = new Spring(55, 5);
  private ant = [0, 1, 2, 3].map((i) => new Spring(80 + i * 15, 4 + i * 0.5));
  private tailE = new Spring(20, 7);
  private flick = new Spring(40, 5);
  private finStretch = new Spring(35, 6);
  private glow = new Spring(10, 6);
  private headY = new Spring(26, 8);
  private curlL = new Spring(40, 6);
  private curlR = new Spring(46, 6);
  /** Lingering contentment after a happy moment: fades over a few seconds, never snaps. */
  private content = 0;
  private lookPrev = 0;
  private turnVel = 0;
  private hopPrev = 0;
  private leanPrev = 0;
  private hopVel = 0;
  private saccade = new THREE.Vector2();
  private saccadeIn = 0.6;
  private fidgetIn = 5;
  private rand: () => number;

  constructor(seed = 11) {
    this.rand = mulberry32(seed);
  }

  apply(
    parts: SpriteParts,
    p: Pose,
    t: number,
    dt: number,
    look: THREE.Vector2,
    flow = 0,
    progress = 0.5,
    reduced = false
  ) {
    dt = Math.max(1e-4, Math.min(dt, 1 / 20));
    const calm = reduced ? 0.35 : 1;
    // How the body is moving drives everything that hangs off it.
    const hv = (p.hop - this.hopPrev) / dt;
    this.hopVel += (hv - this.hopVel) * Math.min(1, dt * 20);
    this.hopPrev = p.hop;
    const lv = (p.leanX - this.leanPrev) / dt;
    this.leanPrev = p.leanX;

    // Idle fidgets: a tail flick or a fin stretch every few seconds.
    this.fidgetIn -= dt;
    if (this.fidgetIn <= 0) {
      this.fidgetIn = 4 + this.rand() * 6;
      if (this.rand() < 0.55) this.flick.kick((this.rand() < 0.5 ? -1 : 1) * 3 * calm);
      else this.finStretch.kick(3.5 * calm);
    }
    // Eye saccades: tiny quick jumps around the gaze point, like a real look.
    this.saccadeIn -= dt;
    if (this.saccadeIn <= 0) {
      this.saccadeIn = 0.35 + this.rand() * 1.2;
      this.saccade.set((this.rand() - 0.5) * 0.18, (this.rand() - 0.5) * 0.12);
    }

    // Emotions fade rather than switch off: joy leaves a soft smile for a few seconds.
    this.content = Math.max(this.content * Math.exp(-dt / 3.5), p.squint * 0.9, p.accent);
    // How fast the gaze is swinging sideways (fins paddle into a turn).
    const tv = (look.x - this.lookPrev) / dt;
    this.lookPrev = look.x;
    this.turnVel += (THREE.MathUtils.clamp(tv, -6, 6) - this.turnVel) * Math.min(1, dt * 8);

    const excite = Math.min(1.6, p.arms + p.accent + flow * 0.8);
    const energy = this.tailE.step(1 + 1.6 * excite, dt);
    const flick = this.flick.step(0, dt);
    const stretch = this.finStretch.step(0, dt);

    // Tail: a wave travelling down the spine, dragged up when Ripple drops and down when it rises.
    parts.bones.forEach((b, i) => {
      if (i < 2) return;
      const k = i / (parts.bones.length - 1);
      const wave = Math.sin(t * (2 + 1.5 * flow) - i * 0.75) * 0.075 * k * energy * calm;
      b.rotation.z = wave - p.leanX * 0.35 * k + flick * 0.12 * k;
      b.rotation.x = Math.sin(t * 1.3 - i * 0.55) * 0.05 * k * calm + p.squash * 0.45 * k - this.hopVel * 0.06 * k;
      b.rotation.y = Math.sin(t * 0.9 - i * 0.4) * 0.03 * k * calm;
    });
    parts.tailFan.rotation.x = Math.sin(t * (3 + 2 * flow) - 2.2) * 0.18 * energy * calm + flick * 0.2;
    parts.tailFan.rotation.z = Math.sin(t * 1.7) * 0.08 * calm;

    // Head: lags the body's hops and sways, then catches up.
    const hx = this.headX.step(-p.leanZ * 0.3 + this.hopVel * 0.05, dt);
    const hz = this.headZ.step(p.tilt * 0.6 - lv * 0.03, dt);
    // The eyes lead and the head follows a little behind them.
    const hy = this.headY.step(look.x * 0.22, dt);
    parts.head.rotation.set(hx, hy, hz);

    // Fin-wings: open on joy, lift as Ripple falls, flutter faster with the pour.
    // Each fin keeps its own rhythm (slightly different rates that drift), paddles into turns,
    // and curls on its own; together they never beat in lockstep.
    const amp = (0.07 + 0.12 * flow + 0.1 * p.accent) * calm;
    const rate = 2.1 + 5 * flow + 3 * p.accent;
    const flapL = Math.sin(t * rate + 0.35 * Math.sin(t * 0.37)) * amp;
    const flapR = Math.sin(t * (rate * 1.13) + 1.7 + 0.35 * Math.sin(t * 0.29 + 1)) * amp * 0.92;
    const base = 0.32 * p.arms + 0.15 * p.wide + 0.08 * this.content + stretch * 0.25 - this.hopVel * 0.12;
    const fl = this.finL.step(base + flapL + this.turnVel * 0.05, dt);
    const fr = this.finR.step(base + flapR - this.turnVel * 0.05 + p.wave * 0.12, dt);
    const cl = this.curlL.step(Math.sin(t * 0.8) * 0.07 * calm - 0.2 * p.accent, dt);
    const crl = this.curlR.step(Math.sin(t * 0.67 + 2) * 0.07 * calm + 0.2 * p.accent, dt);
    parts.fins[0]!.rotation.set(cl * 0.6, -fl, -0.04 * Math.sin(t * 1.6) * calm + cl);
    parts.fins[1]!.rotation.set(crl * 0.6, fr, 0.04 * Math.sin(t * 1.45 + 1) * calm + crl);
    parts.flutter.value = (0.3 + flow * 1.2 + p.accent + p.arms * 0.5) * calm;
    parts.cheekFins.forEach(
      (f, i) => (f.rotation.y = (i === 0 ? -1 : 1) * (Math.sin(t * (5 + 4 * flow) + i) * 0.12 * calm + 0.2 * p.wide))
    );

    // Arms.
    parts.arms.forEach((a, i) => {
      const side = i === 0 ? -1 : 1;
      a.rotation.z =
        side * (0.5 + 1.2 * p.arms) + (side > 0 ? p.wave * 0.5 : -p.wave * 0.15) + Math.sin(t * 1.8 + i) * 0.05 * calm;
      a.rotation.x = -0.4 - 0.6 * p.arms - this.hopVel * 0.1;
    });

    // Crest and antennae: driven by the head's motion, a beat behind.
    const cr = this.crest.step(-hz * 0.8 + Math.sin(t * 1.4) * 0.03 * calm, dt);
    parts.crest.rotation.set(-hx * 0.5, 0, cr);
    parts.antennae.forEach((a, i) => {
      const j = this.ant[i]!.step(
        -hz * 1.2 - this.hopVel * 0.1 * (i % 2 ? 1 : -1) + Math.sin(t * 2.5 + i * 1.3) * 0.06 * calm,
        dt
      );
      a.rotation.z = j;
      a.rotation.x = -p.wide * 0.25;
    });

    // Breathing: the chest swells, the inner light breathes and grows with the day's water.
    const breath = p.breathe;
    parts.chest.scale.set(0.13 * (1 + 0.03 * breath), 0.16 * (1 + 0.04 * breath), 0.04);
    const lum = this.glow.step(0.35 + 0.65 * progress + 0.8 * p.accent + 0.4 * flow, dt) * (0.9 + 0.1 * breath);
    parts.coreMat.color.copy(srgb(0.45, 0.95, 0.92)).multiplyScalar(0.6 + lum * 0.9);

    // Eyes: look, saccade, dilate when curious; lids blink fast and open slower.
    const lx = THREE.MathUtils.clamp(look.x + this.saccade.x, -1, 1);
    const ly = THREE.MathUtils.clamp(look.y + this.saccade.y, -1, 1);
    for (const e of parts.eyes) {
      e.ball.rotation.set(-ly * 0.38, lx * 0.48, 0);
      const dilate = 1 - 0.14 * p.wide + 0.06 * p.squint;
      e.tex.repeat.set(1, dilate);
      const blink = Math.pow(p.blink, 0.6);
      const close = Math.max(blink, Math.min(1, p.squint * 1.15));
      const rest = -1.0 - 0.3 * p.wide;
      e.upper.rotation.x = THREE.MathUtils.lerp(rest, Math.PI / 2 - 0.05, close);
      // Contentment lifts the lower lids a touch: smiling eyes after the smile.
      e.lower.rotation.x = THREE.MathUtils.lerp(0.78, 0.3, Math.max(p.squint, this.content * 0.35));
      const happy = THREE.MathUtils.smoothstep(p.squint, 0.35, 0.7);
      e.arc.scale.set(Math.max(0.001, happy), Math.max(0.001, happy * 0.85), 1);
      const shut = THREE.MathUtils.smoothstep(blink, 0.6, 0.95) * (1 - happy);
      e.lash.scale.set(Math.max(0.001, shut), Math.max(0.001, shut * 0.45), 1);
    }
    const inf = parts.mouth.morphTargetInfluences!;
    inf[0] = THREE.MathUtils.clamp(Math.max(p.smile, 0.35 + 0.45 * this.content), 0, 1);
    inf[1] = THREE.MathUtils.clamp(p.open, 0, 1) * (1 - p.round);
    inf[2] = THREE.MathUtils.clamp(p.round, 0, 1);
  }
}

export function makeSprite(q: SpriteQuality = 'high'): Buddy & { liquid: THREE.Object3D[] } {
  const root = new THREE.Group();
  root.name = 'sprite';
  const rig = new Rig(root);
  const hover = new THREE.Group();
  hover.position.y = 0.14;
  rig.body.add(hover);
  const { model, parts } = buildSpriteModel(q);
  model.scale.setScalar(1.28);
  hover.add(model);
  const motion = new RippleMotion();
  const lk = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  const hit: THREE.Object3D[] = [];
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o.name === 'body' || o.name === 'head_shell' || o.name === 'chest')) hit.push(o);
  });
  return {
    id: 'sprite',
    root,
    hit,
    refractionHidden: [root],
    liquid: parts.liquid,
    temperament: { bounce: 0.85, tempo: 1, float: 0.55 },
    height: 1.3,
    apply(p: Pose, ctx: BuddyContext) {
      rig.apply(p, ctx.look, ctx.dt, 0.5, 0.85);
      // Drifting in water: a slow figure-eight with a bank into each turn.
      const t = ctx.t;
      const calm = ctx.reduced ? 0 : 1;
      // Rates are deliberately unrelated, so the drift never visibly repeats; it rises a
      // little on each breath in, and pitches with how fast it's rising or sinking.
      const bob = Math.sin(t * 1.1) * 0.012 + Math.sin(t * 0.37 + 1) * 0.009 + p.breathe * 0.005;
      const bobV = Math.cos(t * 1.1) * 1.1 * 0.012 + Math.cos(t * 0.37 + 1) * 0.37 * 0.009;
      hover.position.set(
        (Math.sin(t * 0.55) * 0.035 + Math.sin(t * 0.23 + 2) * 0.012) * calm,
        0.14 + bob * calm,
        (Math.sin(t * 1.1) * 0.02 + Math.sin(t * 0.41) * 0.008) * calm
      );
      hover.rotation.set(
        (Math.sin(t * 1.1 + 0.6) * 0.025 - bobV * 1.6) * calm,
        Math.sin(t * 0.55 + 1.2) * 0.06 * calm,
        -(Math.cos(t * 0.55) * 0.05 + Math.cos(t * 0.23 + 2) * 0.012) * calm
      );
      tmp.copy(ctx.look);
      parts.head.worldToLocal(tmp);
      tmp.sub(HEAD).normalize();
      lk.set(THREE.MathUtils.clamp(tmp.x * 1.6, -1, 1), THREE.MathUtils.clamp(tmp.y * 1.6, -1, 1));
      motion.apply(parts, p, t, ctx.dt, lk, ctx.flow ?? 0, ctx.progress, ctx.reduced);
    },
    dispose() {
      disposeTree(root);
    }
  };
}
