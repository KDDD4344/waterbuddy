/**
 * Nimbus: a small daydreaming cloud that hovers above its stone. Built from soft puffs that
 * breathe independently, lit like a real cumulus (warm where the sun hits, cool lavender
 * underneath, glowing at the edges). It drizzles a little when it's happy and throws a
 * rainbow when it celebrates.
 */
import * as THREE from 'three';
import { GLSL_NOISE } from '../noise';
import { OUTPUT, shared } from '../shared';
import type { Buddy, BuddyContext } from './types';
import { Rig, disposeTree } from './rig';
import { lookOffset, makeCheek, makeEye, makeMouth, placeOn } from './face';
import type { Pose } from '../animator';

const HOVER = 0.3;

function cloudMaterial(accent: { value: number }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uSky: shared.uSky,
      uAccent: accent
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uSunColor, uSky; uniform float uTime, uAccent;
      varying vec3 vN; varying vec3 vW;
      ${GLSL_NOISE}
      void main(){
        vec3 q = vW * 9.0 + vec3(0.0, uTime * 0.25, 0.0);
        vec3 n = normalize(normalize(vN) + 0.5 * (vec3(lab_noise(q), lab_noise(q + 5.2), lab_noise(q + 9.7)) - 0.5));
        vec3 v = normalize(cameraPosition - vW);
        float d = smoothstep(-0.45, 0.95, dot(n, uSunDir));
        vec3 lit = vec3(1.0, 0.975, 0.95) * mix(vec3(1.0), uSunColor, 0.5) * 1.12;
        vec3 shade = vec3(0.62, 0.68, 0.88);
        vec3 col = mix(shade, lit, d);
        col *= mix(0.84, 1.0, smoothstep(-0.7, 0.3, n.y));
        float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);
        col += rim * (0.3 * uSky + 0.35 * uSunColor * clamp(dot(v, -uSunDir) * 0.5 + 0.5, 0.0, 1.0));
        col += uAccent * 0.07 * vec3(1.0, 0.82, 0.92);
        gl_FragColor = vec4(col * 0.94, 1.0);
        ${OUTPUT}
      }`
  });
}

const PUFFS: [number, number, number, number, number?][] = [
  [0, 0.36, 0.02, 0.29],
  [0, 0.22, 0, 0.27, 0.6],
  [-0.26, 0.28, 0, 0.2],
  [0.27, 0.29, 0.01, 0.21],
  [-0.13, 0.53, -0.04, 0.2],
  [0.14, 0.55, -0.03, 0.19],
  [0.01, 0.63, -0.1, 0.16],
  [-0.42, 0.22, -0.05, 0.13],
  [0.43, 0.24, -0.04, 0.13],
  [0, 0.38, -0.2, 0.25],
  [-0.24, 0.42, -0.14, 0.17],
  [0.25, 0.43, -0.13, 0.17]
];

export function makeNimbus(): Buddy {
  const root = new THREE.Group();
  root.name = 'nimbus';
  const rig = new Rig(root);
  root.scale.setScalar(1.18);
  const hover = new THREE.Group();
  hover.position.y = HOVER;
  rig.body.add(hover);
  const accent = { value: 0 };
  const mat = cloudMaterial(accent);
  const sphere = new THREE.SphereGeometry(1, 40, 28);
  const puffs = PUFFS.map(([x, y, z, r, sy], i) => {
    const m = new THREE.Mesh(sphere, mat);
    m.position.set(x, y - 0.22, z);
    m.scale.set(r, r * (sy ?? 1), r);
    m.castShadow = true;
    hover.add(m);
    return { m, r, sy: sy ?? 1, ph: i * 1.7 };
  });
  // The face sits on the front puff; find its surface analytically (it's a sphere).
  const c0 = puffs[0]!.m.position;
  const r0 = PUFFS[0]![3];
  const at = (x: number, y: number) => {
    const dz = Math.sqrt(Math.max(0, r0 * r0 - (x - c0.x) ** 2 - (y - c0.y) ** 2));
    const p = new THREE.Vector3(x, y, c0.z + dz);
    return { p, n: p.clone().sub(c0).normalize() };
  };

  const face = new THREE.Group();
  hover.add(face);
  const eyes = [-1, 1].map((side) => {
    const e = makeEye({ size: 0.072, aspect: 0.78, sparkle: 1.35 });
    placeOn(e.group, at(side * 0.105, 0.19), 0.008, 0.5);
    face.add(e.group);
    return { e, side };
  });
  const mouth = makeMouth(0.08, 0x3b2a4a);
  placeOn(mouth.mesh, at(0, 0.085), 0.006, 0.4);
  face.add(mouth.mesh);
  for (const side of [-1, 1]) {
    const ch = makeCheek(0.11, 0xf59ab0, 0.55);
    placeOn(ch, at(side * 0.19, 0.1), 0.004, 0.3);
    face.add(ch);
  }

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.33, 0.08, 0.1);
    const a = new THREE.Mesh(sphere, mat);
    a.scale.setScalar(0.085);
    a.position.x = side * 0.07;
    a.castShadow = true;
    pivot.add(a);
    hover.add(pivot);
    return { pivot, side };
  });

  // Rainbow, behind the cloud, for celebrations.
  const rainbow = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.72, 72, 1, 0, Math.PI),
    new THREE.ShaderMaterial({
      uniforms: { uA: accent },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uA; varying vec2 vP;
        vec3 spec(float x){ return clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0); }
        void main(){ float r = (length(vP) - 0.52) / 0.2; vec3 c = spec(1.0 - r * 0.85);
          float edge = smoothstep(0.0, 0.15, r) * smoothstep(1.0, 0.85, r) * smoothstep(0.0, 0.25, vP.y);
          gl_FragColor = vec4(c * edge * uA * 0.55, 1.0); }`
    })
  );
  rainbow.position.set(0, 0.05, -0.3);
  hover.add(rainbow);

  // Drizzle.
  const dropGeo = new THREE.CapsuleGeometry(0.006, 0.05, 2, 6);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xbfe9f2, transparent: true, opacity: 0, depthWrite: false });
  const drops = Array.from({ length: 14 }, (_, i) => {
    const m = new THREE.Mesh(dropGeo, dropMat);
    hover.add(m);
    return { m, x: Math.sin(i * 12.9898) * 0.28, z: Math.cos(i * 4.1414) * 0.12 - 0.02, o: (i * 0.618) % 1 };
  });

  // Soft shadow on the stone; darker when Nimbus dips lower.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 32),
    new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0.35 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uA; varying vec2 vP; void main(){ float r = length(vP) / 0.45; gl_FragColor = vec4(0.05, 0.12, 0.1, uA * (1.0 - smoothstep(0.0, 1.0, r))); }`
    })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.005;
  root.add(blob);

  const lk = new THREE.Vector2();
  let drizzle = 0;

  return {
    id: 'nimbus',
    root,
    hit: puffs.map((p) => p.m),
    refractionHidden: [],
    temperament: { bounce: 0.8, tempo: 0.95, float: 1 },
    height: HOVER + 0.6,
    apply(p: Pose, ctx: BuddyContext) {
      rig.apply(p, ctx.look, ctx.dt, 0.5, 0.7);
      for (const pf of puffs) {
        const b = 1 + 0.035 * Math.sin(ctx.t * 1.6 + pf.ph) + 0.12 * p.accent * Math.sin(ctx.t * 5 + pf.ph);
        pf.m.scale.set(pf.r * b, pf.r * pf.sy * b, pf.r * b);
      }
      face.rotation.z = p.tilt * 0.6;
      lookOffset(face, ctx.look, lk);
      for (const { e, side } of eyes) e.update(p, lk, side);
      mouth.update(p);
      for (const a of arms)
        a.pivot.rotation.z = a.side * (-0.3 + 1.3 * p.arms + (a.side > 0 ? p.wave * 0.5 : -p.wave * 0.2));
      accent.value = p.accent;
      const wantDrizzle = Math.max(p.accent, p.squint * 0.7);
      drizzle += (wantDrizzle - drizzle) * (1 - Math.exp(-ctx.dt * 3));
      dropMat.opacity = drizzle * 0.75;
      for (const d of drops) {
        const k = (ctx.t * 1.6 + d.o) % 1;
        d.m.position.set(d.x, -0.06 - k * (HOVER + p.hop - 0.02), d.z);
        d.m.visible = drizzle > 0.02;
      }
      (blob.material as THREE.ShaderMaterial).uniforms.uA!.value = 0.38 - 0.6 * Math.max(0, p.hop);
    },
    dispose() {
      disposeTree(root);
    }
  };
}
