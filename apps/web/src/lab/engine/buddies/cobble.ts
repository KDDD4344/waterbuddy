/**
 * Cobble: a river stone smoothed by a thousand years of water, warm sandstone with a band
 * of white quartz, wearing a cap of moss. A sprout grows from the moss: its leaves open as
 * the day's drinking goes on, it spins like a propeller when Cobble celebrates, and it
 * flowers when the goal is met. Heavy and calm: small hops, slow sways, sleepy eyes.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm3 } from '../noise';
import { GLSL_NOISE } from '../noise';
import { srgb } from '../shared';
import type { Buddy, BuddyContext } from './types';
import { Rig, disposeTree } from './rig';
import { lookOffset, makeCheek, makeEye, makeMouth, placeOn, surfaceAt } from './face';
import type { Pose } from '../animator';

const RX = 0.43;
const RY = 0.31;
const RZ = 0.37;

function stoneGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 72, 52);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = 1 + 0.045 * fbm3(x * 1.6 + 3, y * 1.6, z * 1.6, 3);
    let py = y * RY * d;
    // Sits flat: the underside flattens onto the ground, the top stays domed.
    if (py < -RY * 0.55) py = -RY * 0.55 + (py + RY * 0.55) * 0.25;
    pos.setXYZ(i, x * RX * d * (1 + 0.06 * y), py + RY * 0.62, z * RZ * d);
  }
  g.computeVertexNormals();
  return g;
}

function stoneMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: srgb(0.8, 0.6, 0.43),
    roughness: 0.5,
    clearcoat: 0.45,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.9
  });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj;\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float mott = lab_fbm(vObj * 7.0);
        diffuseColor.rgb *= 0.86 + 0.28 * mott;
        float fleck = smoothstep(0.86, 0.9, lab_noise(vObj * 95.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.07, 0.04), fleck * 0.45);
        float lite = smoothstep(0.84, 0.9, lab_noise(vObj * 75.0 + 7.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.83, 0.64), lite * 0.5);
        float bandY = vObj.y - 0.135 + 0.13 * vObj.x + 0.01 * sin(vObj.z * 31.0 + vObj.x * 9.0);
        float band = 1.0 - smoothstep(0.016, 0.026, abs(bandY));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.89, 0.79), band * 0.92);
        diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 0.08, vObj.y));`
      );
  };
  return mat;
}

function leafShape(len: number, wid: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid * 0.9, len * 0.18, wid * 0.75, len * 0.75, 0, len);
  s.bezierCurveTo(-wid * 0.75, len * 0.75, -wid * 0.9, len * 0.18, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  // Cup the leaf a little along its midrib.
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, ((x * x) / wid) * 0.9 - 0.15 * (y / len) ** 2 * len);
  }
  g.computeVertexNormals();
  return g;
}

export function makeCobble(): Buddy {
  const root = new THREE.Group();
  root.name = 'cobble';
  const rig = new Rig(root);
  const stoneMat = stoneMaterial();
  const body = new THREE.Mesh(stoneGeometry(), stoneMat);
  body.castShadow = true;
  body.receiveShadow = true;
  rig.body.add(body);
  const top = RY * 1.6;

  // Moss cap: lumpy, velvety.
  let mossGeo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 5);
  mossGeo.deleteAttribute('normal');
  mossGeo.deleteAttribute('uv');
  mossGeo = mergeVertices(mossGeo);
  {
    const pos = mossGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const d = 1 + 0.16 * fbm3(x * 4, y * 4, z * 4, 3) + 0.03 * fbm3(x * 12, y * 12, z * 12, 2);
      pos.setXYZ(i, x * 0.27 * d, y * 0.1 * d, z * 0.25 * d);
    }
    mossGeo.computeVertexNormals();
  }
  const moss = new THREE.Mesh(
    mossGeo,
    new THREE.MeshPhysicalMaterial({
      color: srgb(0.3, 0.48, 0.17),
      roughness: 1,
      sheen: 1,
      sheenColor: srgb(0.55, 0.75, 0.3),
      sheenRoughness: 0.45
    })
  );
  moss.position.set(-0.02, top - 0.035, -0.05);
  moss.rotation.z = 0.12;
  moss.castShadow = true;
  rig.body.add(moss);

  // Sprout: stem, two leaves that open with the day's progress, a flower at the goal.
  const sprout = new THREE.Group();
  sprout.position.set(-0.02, top + 0.03, -0.05);
  rig.body.add(sprout);
  const green = new THREE.MeshStandardMaterial({
    color: srgb(0.42, 0.7, 0.24),
    roughness: 0.55,
    side: THREE.DoubleSide
  });
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.03, 0),
    new THREE.Vector3(0.012, 0.07, 0),
    new THREE.Vector3(-0.005, 0.15, 0)
  ]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 12, 0.011, 6), green);
  sprout.add(stem);
  const crown = new THREE.Group();
  crown.position.y = 0.15;
  sprout.add(crown);
  const leafMat = new THREE.MeshStandardMaterial({
    color: srgb(0.52, 0.8, 0.3),
    roughness: 0.45,
    side: THREE.DoubleSide
  });
  const leaves = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.rotation.y = side > 0 ? 0 : Math.PI;
    const tiltG = new THREE.Group();
    pivot.add(tiltG);
    const leaf = new THREE.Mesh(leafShape(0.2, 0.1), leafMat);
    leaf.castShadow = true;
    tiltG.add(leaf);
    crown.add(pivot);
    return tiltG;
  });
  const flower = new THREE.Group();
  crown.add(flower);
  const petalMat = new THREE.MeshStandardMaterial({ color: srgb(1.0, 0.86, 0.9), roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    const pet = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), petalMat);
    const a = (i / 5) * Math.PI * 2;
    pet.scale.set(0.028, 0.012, 0.018);
    pet.position.set(Math.cos(a) * 0.026, 0.012, Math.sin(a) * 0.026);
    pet.rotation.y = -a;
    flower.add(pet);
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6 })
  );
  center.position.y = 0.016;
  flower.add(center);
  flower.scale.setScalar(0.001);

  // Feet.
  const feet = [-1, 1].map((side) => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), stoneMat);
    f.scale.set(0.085, 0.05, 0.08);
    f.position.set(side * 0.17, 0.03, 0.2);
    f.castShadow = true;
    rig.body.add(f);
    return { f, side };
  });

  const face = new THREE.Group();
  rig.body.add(face);
  const eyes = [-1, 1].map((side) => {
    const e = makeEye({ size: 0.062, aspect: 0.95, rest: 0.72, brow: 0x5b3b2a });
    placeOn(e.group, surfaceAt(body, side * 0.125, 0.33), 0.006, 0.4);
    face.add(e.group);
    return { e, side };
  });
  const mouth = makeMouth(0.085, 0x3a1d1d);
  placeOn(mouth.mesh, surfaceAt(body, 0, 0.245), 0.004, 0.3);
  face.add(mouth.mesh);
  for (const side of [-1, 1]) {
    const ch = makeCheek(0.11, 0xe2725b, 0.5);
    placeOn(ch, surfaceAt(body, side * 0.22, 0.255), 0.003, 0.2);
    face.add(ch);
  }

  const lk = new THREE.Vector2();
  let spin = 0;
  let bloom = 0;
  let sway = 0;
  let swayV = 0;
  let lastLean = 0;

  return {
    id: 'cobble',
    root,
    hit: [body, moss],
    refractionHidden: [],
    temperament: { bounce: 0.45, tempo: 0.8, float: 0 },
    height: top + 0.2,
    apply(p: Pose, ctx: BuddyContext) {
      rig.apply(p, ctx.look, ctx.dt, 0.45, 0.8);
      face.rotation.z = p.tilt * 0.5;
      lookOffset(face, ctx.look, lk);
      for (const { e, side } of eyes) e.update(p, lk, side);
      mouth.update(p);
      // The sprout lags behind the body like a real stem (a damped spring on the lean).
      const leanV = (p.leanX - lastLean) / Math.max(ctx.dt, 1e-3);
      lastLean = p.leanX;
      swayV += (-sway * 60 - swayV * 4 - leanV * 0.9 - p.hop * 0) * ctx.dt;
      sway += swayV * ctx.dt;
      sprout.rotation.z = sway * 0.6 + 0.05 * Math.sin(ctx.t * 1.3);
      sprout.rotation.x = -p.leanZ * 0.6;
      spin += ctx.dt * (0.3 + 22 * p.accent);
      crown.rotation.y = spin;
      const open = 0.35 + 0.85 * ctx.progress;
      for (const l of leaves)
        l.rotation.x = -(Math.PI / 2 - 0.25) + open * 0.9 + 0.15 * p.arms + 0.05 * Math.sin(ctx.t * 2);
      sprout.scale.setScalar(0.8 + 0.35 * ctx.progress + 0.15 * p.accent);
      const wantBloom = Math.max(p.accent, ctx.progress >= 1 ? 1 : 0);
      bloom += (wantBloom - bloom) * (1 - Math.exp(-ctx.dt * 4));
      flower.scale.setScalar(Math.max(0.001, bloom));
      for (const { f, side } of feet) {
        f.rotation.x = 0.4 * p.wave * side;
        f.position.y = 0.03 + Math.max(0, p.wave * side) * 0.025;
      }
    },
    dispose() {
      disposeTree(root);
    }
  };
}
