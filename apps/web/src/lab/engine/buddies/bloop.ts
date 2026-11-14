/**
 * Bloop: a living drop of the spring. A teardrop of jelly whose tip curls like a flick of
 * water, with a warm glowing heart and bubbles drifting inside. The jelly genuinely refracts
 * whatever is behind it (it samples the finished frame), wobbles on landing and glows at
 * its brightest when celebrating.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLSL_NOISE } from '../noise';
import { shared } from '../shared';
import type { Buddy, BuddyContext } from './types';
import { Rig, disposeTree } from './rig';
import { lookOffset, makeCheek, makeEye, makeMouth, placeOn, surfaceAt } from './face';
import type { Pose } from '../animator';

/** Meshes on this layer are drawn in a last pass over a copy of the frame (true refraction). */
export const JELLY_LAYER = 2;
/** Bloop's face is drawn after the jelly, so it stays crisp instead of being refracted. */
export const FACE_LAYER = 3;

const H = 0.98;

function bodyGeometry(): THREE.BufferGeometry {
  const pts = [
    [0, 0],
    [0.2, 0.004],
    [0.33, 0.03],
    [0.41, 0.08],
    [0.45, 0.15],
    [0.46, 0.24],
    [0.44, 0.34],
    [0.4, 0.45],
    [0.33, 0.56],
    [0.25, 0.66],
    [0.17, 0.75],
    [0.105, 0.83],
    [0.055, 0.9],
    [0.018, 0.955],
    [0, 0.975]
  ].map(([r, y]) => new THREE.Vector2(r!, y! * H));
  const curve = new THREE.SplineCurve(pts);
  let g: THREE.BufferGeometry = new THREE.LatheGeometry(curve.getPoints(56), 64);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  // Curl the tip toward one side, like a flick of water frozen mid-air.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const y0 = 0.58 * H;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    if (y <= y0) continue;
    const k = (y - y0) / (H - y0);
    const a = 1.05 * k ** 1.7;
    const dy = y - y0;
    pos.setXY(i, x * Math.cos(a) + dy * Math.sin(a), -x * Math.sin(a) + dy * Math.cos(a) + y0);
  }
  g.computeVertexNormals();
  return g;
}

function jellyMaterial(frame: { value: THREE.Texture | null }) {
  const u = {
    uTime: shared.uTime,
    uSunDir: shared.uSunDir,
    uSunColor: shared.uSunColor,
    uSky: shared.uSky,
    uRes: shared.uRes,
    uFrame: frame,
    uJiggle: { value: 0 },
    uGlow: { value: 0 },
    uColor: { value: new THREE.Color(0.25, 0.8, 0.85) },
    uDeep: { value: new THREE.Color(0.03, 0.32, 0.42) },
    uHeart: { value: new THREE.Color(1.0, 0.72, 0.42) }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    toneMapped: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uJiggle;
      varying vec3 vN; varying vec3 vW; varying vec3 vNV; varying vec3 vO;
      void main(){
        vec3 p = position;
        float w = sin(p.y * 13.0 - uTime * 17.0) * uJiggle * 0.03 + sin(p.y * 6.0 + p.x * 4.0 + uTime * 2.1) * 0.005;
        p += normal * w;
        vO = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vNV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFrame; uniform vec2 uRes;
      uniform vec3 uSunDir, uSunColor, uSky, uColor, uDeep, uHeart;
      uniform float uTime, uGlow;
      varying vec3 vN; varying vec3 vW; varying vec3 vNV; varying vec3 vO;
      ${GLSL_NOISE}
      void main(){
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vW);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
        vec2 suv = gl_FragCoord.xy / uRes;
        vec2 off = vNV.xy * (0.012 + 0.05 * (1.0 - ndv));
        // The frame copy is display-encoded; decode to linear before lighting.
        vec3 behind = pow(texture2D(uFrame, clamp(suv - off, 0.001, 0.999)).rgb, vec3(2.2));
        float thick = mix(0.35, 1.0, ndv);
        vec3 col = behind * mix(vec3(1.0), uColor, 0.85 * thick) * 0.92;
        float wrap = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        col = mix(col, uDeep * (0.45 + 0.55 * wrap), 0.3 * thick);
        col += uColor * 0.05;
        float back = pow(clamp(dot(v, -uSunDir), 0.0, 1.0), 3.0) * (1.0 - ndv);
        col += uColor * back * 0.35;
        float c = lab_caustic(vO.xy * 9.0 + vec2(vO.z * 4.0, 0.0), uTime * 0.8);
        col += uColor * c * 0.08 * thick;
        // Heart glow seen through the front.
        float heart = exp(-dot(vO.xy - vec2(0.02, 0.17), vO.xy - vec2(0.02, 0.17)) * 26.0) * ndv;
        col += uHeart * heart * (0.08 + 0.5 * uGlow);
        col += mix(uColor, uHeart, 0.5) * uGlow * 0.12 * thick;
        vec3 r = reflect(-v, n);
        vec3 env = mix(uSky * 0.55, vec3(0.95, 0.93, 0.85), smoothstep(-0.1, 0.8, r.y));
        col = mix(col, env, fres * 0.9);
        vec3 h = normalize(uSunDir + v);
        float nh = max(dot(n, h), 0.0);
        col += uSunColor * (pow(nh, 260.0) * 3.2 + pow(nh, 28.0) * 0.12);
        col += uColor * pow(1.0 - ndv, 2.5) * 0.18;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`
  });
  return { mat, u };
}

export function makeBloop(frame: { value: THREE.Texture | null }): Buddy {
  const root = new THREE.Group();
  root.name = 'bloop';
  const rig = new Rig(root);
  const { mat, u } = jellyMaterial(frame);
  const body = new THREE.Mesh(bodyGeometry(), mat);
  body.layers.set(JELLY_LAYER);
  body.castShadow = true;
  rig.body.add(body);

  // The heart and bubbles live inside; they're drawn first and seen through the jelly.
  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(0.048, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.18), toneMapped: false })
  );
  heart.position.set(0.02, 0.17, -0.12);
  rig.body.add(heart);
  const bubbleMat = new THREE.MeshBasicMaterial({
    color: 0xeafcff,
    transparent: true,
    opacity: 0.55,
    toneMapped: false
  });
  const bubbles: { m: THREE.Mesh; x: number; z: number; s: number; o: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), bubbleMat);
    const b = {
      m,
      x: (Math.random() - 0.5) * 0.4,
      z: (Math.random() - 0.5) * 0.3,
      s: 0.012 + Math.random() * 0.02,
      o: Math.random()
    };
    m.scale.setScalar(b.s);
    rig.body.add(m);
    bubbles.push(b);
  }

  const face = new THREE.Group();
  rig.body.add(face);
  const eyes = [-1, 1].map((side) => {
    const e = makeEye({ size: 0.078, aspect: 0.8, sparkle: 1.15 });
    placeOn(e.group, surfaceAt(body, side * 0.13, 0.43), 0.012, 0.55);
    face.add(e.group);
    return { e, side };
  });
  const mouth = makeMouth(0.1, 0x1d3d4a);
  placeOn(mouth.mesh, surfaceAt(body, 0, 0.315), 0.006);
  face.add(mouth.mesh);
  for (const side of [-1, 1]) {
    const ch = makeCheek(0.12, 0xff8fa3, 0.45);
    placeOn(ch, surfaceAt(body, side * 0.23, 0.34), 0.004);
    face.add(ch);
  }

  face.traverse((o) => o.layers.set(FACE_LAYER));

  // Little fins for arms, the same jelly.
  const fins = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.43, 0.2, 0.02);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
    fin.scale.set(0.1, 0.05, 0.065);
    fin.position.x = side * 0.07;
    fin.layers.set(JELLY_LAYER);
    pivot.add(fin);
    rig.body.add(pivot);
    return { pivot, side };
  });

  // Light through the jelly throws a little caustic onto the stone.
  const caustic = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 32),
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uGlow: u.uGlow },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uGlow; varying vec2 vP; ${GLSL_NOISE}
        void main(){ float r = length(vP) / 0.6; float c = lab_caustic(vP * 9.0, uTime * 0.7);
          float a = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.1, 0.4, r);
          gl_FragColor = vec4(vec3(0.35, 0.85, 0.9) * c * a * (0.35 + 0.8 * uGlow), 1.0); }`
    })
  );
  caustic.rotation.x = -Math.PI / 2;
  caustic.position.set(0.18, 0.004, 0.15);
  root.add(caustic);

  const lk = new THREE.Vector2();
  let jiggle = 0;
  let lastSquash = 0;

  return {
    id: 'bloop',
    root,
    hit: [body],
    refractionHidden: [],
    temperament: { bounce: 1, tempo: 1.1, float: 0 },
    height: H,
    apply(p: Pose, ctx: BuddyContext) {
      rig.apply(p, ctx.look, ctx.dt, 0.6, 1.25);
      // Jelly jiggles when the squash changes quickly (landings) and on cue.
      const dv = Math.abs(p.squash - lastSquash) / Math.max(ctx.dt, 1e-3);
      lastSquash = p.squash;
      jiggle = Math.max(jiggle * Math.exp(-ctx.dt * 3), Math.min(1, dv * 0.25 + p.jiggle));
      u.uJiggle.value = jiggle;
      u.uGlow.value = p.accent + 0.15 * ctx.progress;
      face.rotation.z = p.tilt * 0.6;
      lookOffset(face, ctx.look, lk);
      for (const { e, side } of eyes) e.update(p, lk, side);
      mouth.update(p);
      heart.scale.setScalar(1 + 0.08 * p.breathe + 0.5 * p.accent);
      for (const b of bubbles) {
        const k = (ctx.t * 0.12 + b.o) % 1;
        b.m.position.set(b.x * (1 - k * 0.6), 0.06 + k * 0.62, b.z * (1 - k * 0.6) - 0.05);
        b.m.scale.setScalar(b.s * Math.sin(Math.PI * k));
      }
      for (const f of fins) {
        f.pivot.rotation.z = f.side * (0.2 + 1.1 * p.arms + (f.side > 0 ? p.wave * 0.5 : 0));
      }
    },
    dispose() {
      disposeTree(root);
    }
  };
}
