// WaterBuddy creative reset: shared 3D building blocks.
// Characters are built procedurally from primitives so the prototype needs no model files.
// In production these become Blender-authored glTF models; the motion logic stays the same.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
export { THREE };

export const reducedMotionPreferred = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function makeRenderer(canvas, { alpha = false, maxDpr = 1.75 } = {}) {
  const preserveDrawingBuffer = /[?&]debug\b/.test(location.search);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance', preserveDrawingBuffer });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  return r;
}

export function fit(renderer, camera, el) {
  const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== w || size.y !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const bump = (x) => (x <= 0 || x >= 1) ? 0 : Math.sin(Math.PI * x);
const rand = (a, b) => a + Math.random() * (b - a);

export class Spring {
  constructor(v = 0, k = 60, d = 9) { this.v = v; this.target = v; this.vel = 0; this.k = k; this.d = d; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const f = -this.k * (this.v - this.target) - this.d * this.vel;
      this.vel += f * h; this.v += this.vel * h;
    }
    return this.v;
  }
}

export function studioLights(scene, { warm = 1 } = {}) {
  const hemi = new THREE.HemisphereLight(0xe3f6f1, 0x24414a, 1.15);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1 * warm);
  key.position.set(3, 6, 5);
  const rim = new THREE.DirectionalLight(0x9fe3da, 1.4);
  rim.position.set(-5, 3, -4);
  scene.add(hemi, key, rim);
  return { hemi, key, rim };
}

const CS = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

const WORLD_VS = `
varying vec3 vN; varying vec3 vW; varying vec3 vV; varying vec2 vUv;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export function glassMaterial({ tint = 0xd5f4ee, opacity = 0.08, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: new THREE.Color(tint) },
      uOpacity: { value: opacity },
      uLight: { value: new THREE.Vector3(0.45, 0.85, 0.5).normalize() }
    },
    vertexShader: WORLD_VS,
    fragmentShader: `
      uniform vec3 uTint; uniform float uOpacity; uniform vec3 uLight;
      varying vec3 vN; varying vec3 vW; varying vec3 vV;
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        float f = pow(1.0 - abs(dot(n, vV)), 2.6);
        vec3 h = normalize(uLight + vV);
        float spec = pow(max(dot(n, h), 0.0), 120.0) * 1.6;
        float streak = smoothstep(0.93, 0.99, dot(n, normalize(vec3(-0.55, 0.35, 0.76)))) * 0.45;
        vec3 col = uTint * (0.55 + f * 0.9) + vec3(spec + streak);
        float a = clamp(uOpacity + f * 0.5 + spec + streak, 0.0, 0.92);
        gl_FragColor = vec4(col, a);
        ${CS}
      }`,
    transparent: true, depthWrite: false, side
  });
}

export function liquidMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFill: { value: 0 }, uWob: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector3() },
      uTime: { value: 0 }, uRipple: { value: 0 }, uRipplePos: { value: new THREE.Vector2() },
      uDeep: { value: new THREE.Color(0x0d5866) }, uShallow: { value: new THREE.Color(0x4fc0b2) },
      uSurf: { value: new THREE.Color(0xc4f2ea) }, uLight: { value: new THREE.Vector3(0.45, 0.85, 0.5).normalize() },
      uOn: { value: 1 }
    },
    vertexShader: WORLD_VS,
    fragmentShader: `
      uniform float uFill, uTime, uRipple, uOn; uniform vec2 uWob, uRipplePos; uniform vec3 uCenter;
      uniform vec3 uDeep, uShallow, uSurf, uLight;
      varying vec3 vN; varying vec3 vW; varying vec3 vV;
      void main(){
        vec2 d = vW.xz - uCenter.xz;
        float rd = length(vW.xz - uRipplePos);
        float h = uFill + uWob.x * d.x + uWob.y * d.y
                + uRipple * 0.035 * sin(rd * 16.0 - uTime * 10.0) * exp(-rd * 1.6)
                + 0.008 * sin(vW.x * 7.0 + uTime * 2.1) * sin(vW.z * 6.0 - uTime * 1.7);
        if (vW.y > h || uOn < 0.5) discard;
        vec3 n = normalize(vN);
        if (dot(n, vV) > 0.0) {
          float depth = clamp((h - vW.y) * 0.9, 0.0, 1.0);
          vec3 c = mix(uShallow, uDeep, depth);
          float f = pow(1.0 - abs(dot(n, vV)), 2.0);
          c += f * 0.22;
          float spec = pow(max(dot(n, normalize(uLight + vV)), 0.0), 70.0);
          c += spec * 0.7;
          float edge = smoothstep(0.035, 0.0, h - vW.y);
          c = mix(c, uSurf, edge * 0.8);
          gl_FragColor = vec4(c, 0.9);
        } else {
          float s = 0.5 + 0.5 * sin(vW.x * 22.0 + uTime * 3.0) * sin(vW.z * 19.0 - uTime * 2.4);
          float ring = uRipple * 0.5 * (0.5 + 0.5 * sin(rd * 26.0 - uTime * 12.0)) * exp(-rd * 2.0);
          vec3 c = mix(uShallow, uSurf, 0.5 + 0.3 * s + ring);
          gl_FragColor = vec4(c, 0.95);
        }
        ${CS}
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
}

// Soft round particles (splashes, bubbles, motes)
export class Particles {
  constructor(max, { color = 0xffffff, additive = false, ring = false } = {}) {
    this.max = max; this.alive = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max); this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 300 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ vec2 p = gl_PointCoord - 0.5; float r = length(p); if (r > 0.5) discard;
          float a = ${ring ? 'smoothstep(0.5,0.38,r) * (0.35 + smoothstep(0.3,0.46,r))' : 'smoothstep(0.5,0.1,r)'};
          vec3 c = uColor + ${ring ? 'vec3(0.25) * smoothstep(0.2,0.0,length(p - vec2(-0.15,0.15)))' : 'vec3(0.0)'};
          gl_FragColor = vec4(c, a * vA); ${CS} }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  spawn(p, v, life, size) {
    let i = -1;
    for (let k = 0; k < this.max; k++) if (this.life[k] <= 0) { i = k; break; }
    if (i < 0) return;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.age[i] = 0; this.size[i] = size;
  }
  update(dt, { gravity = -9, drag = 0.5, ceiling = null, fadeIn = 0.05 } = {}) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.age[i] += dt;
      const k = i * 3;
      this.vel[k + 1] += gravity * dt;
      const dr = Math.exp(-drag * dt);
      this.vel[k] *= dr; this.vel[k + 1] *= dr; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1 || (ceiling !== null && this.pos[k + 1] > ceiling(this.pos[k], this.pos[k + 2]))) { this.life[i] = 0; this.alpha[i] = 0; continue; }
      this.alpha[i] = Math.min(1, this.age[i] / fadeIn) * (1 - t * t);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ *
 *  CONCEPT A: PIP, a hermit crab whose shell is a glass bottle        *
 * ------------------------------------------------------------------ */
export function buildPip({ fill = 0.45 } = {}) {
  const root = new THREE.Group();
  const M = {
    coral: new THREE.MeshPhysicalMaterial({ color: 0xe9784f, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.7, sheenColor: new THREE.Color(0xffc9a6) }),
    plate: new THREE.MeshPhysicalMaterial({ color: 0xc0523a, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    cream: new THREE.MeshPhysicalMaterial({ color: 0xf7e2c4, roughness: 0.5, sheen: 0.5 }),
    tip: new THREE.MeshPhysicalMaterial({ color: 0x5a2a22, roughness: 0.35, clearcoat: 0.8 }),
    eye: new THREE.MeshPhysicalMaterial({ color: 0xfcfbf6, roughness: 0.12, clearcoat: 1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: 0x0f1d26, roughness: 0.08, clearcoat: 1 }),
    hi: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cork: new THREE.MeshStandardMaterial({ color: 0xc69b6b, roughness: 0.92 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.85 }),
    ribbon: new THREE.MeshStandardMaterial({ color: 0xb4513a, roughness: 0.6 })
  };

  // --- the bottle (shell + canteen + boat + mailbox) ---
  const yaw = new THREE.Group(); yaw.rotation.y = -0.2; root.add(yaw);
  const bottle = new THREE.Group(); bottle.rotation.z = -1.22; yaw.add(bottle);
  const prof = [[0.0, -1.2], [0.5, -1.2], [0.66, -1.14], [0.72, -1.02], [0.73, 0.45], [0.66, 0.72], [0.46, 0.92], [0.3, 1.04], [0.27, 1.12], [0.27, 1.46], [0.31, 1.49], [0.31, 1.56], [0.26, 1.58]]
    .map((p) => new THREE.Vector2(p[0], p[1]));
  const glassGeo = new THREE.LatheGeometry(prof, 56);
  const glassBack = new THREE.Mesh(glassGeo, glassMaterial({ side: THREE.BackSide, opacity: 0.07 }));
  glassBack.renderOrder = 1;
  const glassFront = new THREE.Mesh(glassGeo, glassMaterial({ side: THREE.FrontSide, opacity: 0.1 }));
  glassFront.renderOrder = 3;
  const inner = [[0.0, -1.12], [0.48, -1.12], [0.62, -1.07], [0.67, -0.96], [0.68, 0.43], [0.61, 0.69], [0.43, 0.88], [0.27, 1.0], [0.0, 1.0]]
    .map((p) => new THREE.Vector2(p[0], p[1]));
  const liqMat = liquidMaterial();
  liqMat.side = THREE.FrontSide;
  const liqBackMat = liquidMaterial();
  liqBackMat.uniforms = liqMat.uniforms; liqBackMat.side = THREE.BackSide;
  const liqGeo = new THREE.LatheGeometry(inner, 56);
  const liquidBack = new THREE.Mesh(liqGeo, liqBackMat); liquidBack.renderOrder = 2;
  const liquid = new THREE.Mesh(liqGeo, liqMat);
  liquid.renderOrder = 3; glassFront.renderOrder = 4;
  bottle.add(glassBack, liquidBack, liquid, glassFront);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.34, 24), M.cork);
  cork.position.y = 1.62; cork.visible = false; bottle.add(cork);
  const scroll = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.55, 20), M.paper);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.02, 8, 24), M.ribbon); band.rotation.x = Math.PI / 2;
  scroll.add(roll, band); scroll.position.y = 1.2; scroll.visible = false; bottle.add(scroll);

  // mouth position and neck direction in yaw-space
  const rz = bottle.rotation.z;
  const dir = new THREE.Vector3(-Math.sin(rz), Math.cos(rz), 0);
  const mouth = dir.clone().multiplyScalar(1.58);

  // --- Pip ---
  const pip = new THREE.Group(); yaw.add(pip);
  const seat = mouth.clone().add(dir.clone().multiplyScalar(0.12)).add(new THREE.Vector3(0, 0.08, 0));
  pip.position.copy(seat);
  pip.rotation.y = 0.75;
  const body = new THREE.Group(); pip.add(body);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 40, 28), M.coral);
  shell.scale.set(1.12, 0.78, 0.96); body.add(shell);
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.41, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), M.plate);
  plate.scale.set(1.12, 0.8, 0.97); plate.position.y = 0.012; body.add(plate);
  [[0.16, 0.26, 0.14, 0.05], [-0.12, 0.27, 0.16, 0.04], [0.02, 0.3, -0.05, 0.035]].forEach(([x, y, z, r]) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), M.cream); s.position.set(x, y, z); s.scale.y = 0.45; body.add(s);
  });
  const mouthparts = new THREE.Group(); body.add(mouthparts);
  [-0.05, 0.05].forEach((x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), M.cream); m.position.set(x, -0.08, 0.36); mouthparts.add(m); });

  function makeEye(side) {
    const stalk = new THREE.Group(); stalk.position.set(0.14 * side, 0.2, 0.17); body.add(stalk);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.38, 14), M.coral);
    st.position.y = 0.19; stalk.add(st);
    const eye = new THREE.Group(); eye.position.y = 0.4; stalk.add(eye);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 20), M.eye); eye.add(ball);
    const pupil = new THREE.Group(); eye.add(pupil);
    const pp = new THREE.Mesh(new THREE.SphereGeometry(0.078, 24, 16), M.pupil); pp.position.z = 0.07; pp.scale.z = 0.6; pupil.add(pp);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), M.hi); hl.position.set(0.03 * side + 0.01, 0.035, 0.118); pupil.add(hl);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.128, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), M.plate);
    eye.add(lid);
    return { stalk, eye, pupil, lid };
  }
  const eyeL = makeEye(-1), eyeR = makeEye(1);

  function makeAntenna(side) {
    const g = new THREE.Group(); g.position.set(0.05 * side, 0.02, 0.33); body.add(g);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08 * side, 0.18, 0.12), new THREE.Vector3(0.22 * side, 0.28, 0.1), new THREE.Vector3(0.36 * side, 0.3, -0.02)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.011, 6), M.plate));
    return g;
  }
  const antL = makeAntenna(-1), antR = makeAntenna(1);

  function makeClaw(side, s) {
    const shoulder = new THREE.Group(); shoulder.position.set(0.34 * side, -0.1, 0.18); body.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * s, 0.2 * s, 6, 12), M.coral);
    upper.rotation.z = Math.PI / 2; upper.position.x = 0.14 * s * side; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.x = 0.28 * s * side; shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * s, 0.14 * s, 6, 12), M.coral);
    fore.rotation.x = Math.PI / 2; fore.position.z = 0.1 * s; elbow.add(fore);
    const hand = new THREE.Group(); hand.position.z = 0.22 * s; elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 28, 20), M.coral); palm.scale.set(1.15, 0.9, 1.05); hand.add(palm);
    const fixedF = new THREE.Mesh(new THREE.SphereGeometry(0.065 * s, 16, 12), M.coral);
    fixedF.position.set(0, -0.05 * s, 0.2 * s); fixedF.scale.set(1, 0.75, 2.6); hand.add(fixedF);
    const tip1 = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 10, 8), M.tip); tip1.position.set(0, -0.05 * s, 0.36 * s); hand.add(tip1);
    const dact = new THREE.Group(); dact.position.set(0, 0.06 * s, 0.08 * s); hand.add(dact);
    const df = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 16, 12), M.plate); df.position.z = 0.13 * s; df.scale.set(1, 0.75, 2.5); dact.add(df);
    const tip2 = new THREE.Mesh(new THREE.SphereGeometry(0.032 * s, 10, 8), M.tip); tip2.position.z = 0.27 * s; dact.add(tip2);
    return { shoulder, elbow, hand, dact };
  }
  const clawR = makeClaw(1, 1.05), clawL = makeClaw(-1, 0.62);

  const legs = [];
  [[1, 0.06], [1, -0.12], [-1, 0.06], [-1, -0.12]].forEach(([side, z]) => {
    const hip = new THREE.Group(); hip.position.set(0.3 * side, -0.16, z); body.add(hip);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 10), M.coral);
    a.rotation.z = Math.PI / 2 - 0.7 * side; a.position.set(0.09 * side, -0.05, 0); hip.add(a);
    const knee = new THREE.Group(); knee.position.set(0.18 * side, -0.11, 0); hip.add(knee);
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.2, 4, 10), M.coral);
    b.position.y = -0.12; b.rotation.z = 0.25 * side; knee.add(b);
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M.tip); t.position.set(0.03 * side, -0.24, 0); knee.add(t);
    legs.push({ hip, knee, side });
  });

  // --- motion state ---
  const S = {
    expr: 'idle', w: { idle: 1, happy: 0, surprised: 0, sleepy: 0 },
    triggers: [], look: null, lookW: 0,
    sacL: new THREE.Vector2(), sacR: new THREE.Vector2(), sacTL: new THREE.Vector2(), sacTR: new THREE.Vector2(),
    nextSac: 0, nextBlink: 1.5, blinkT: -1, nextClick: 4, clickT: -1, nextTap: 9, tapT: -1,
    fill: new Spring(fill, 38, 6.5), wobX: 0, wobZ: 0, wobVX: 0, wobVZ: 0, ripple: 0,
    sealed: false, posY: 0, hide: 0, out: 1, hiddenForced: false, perch: 0, perchT: 0
  };
  const seatTop = new THREE.Vector3(-0.12, 0.98, 0.2);
  const seatTmp = new THREE.Vector3();
  const worldTmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const liqPos = liquid.geometry.attributes.position;

  const api = {
    root, bottle, pip, liquid, cork, scroll, yaw, dir, mouth, M,
    get fillValue() { return S.fill.v; },
    setFill(f, instant = false) { S.fill.target = f; if (instant) { S.fill.v = f; S.fill.vel = 0; } },
    setExpression(e) { S.expr = e; },
    impulse(x = 1, z = 0.6) { S.wobVX += 1.6 * x; S.wobVZ += 1.2 * z; S.ripple = 1; },
    trigger(name, dur) {
      const d = dur || { hide: 1.1, cheer: 1.1, dance: 2.2, wave: 1.4, peek: 0.9, click: 0.5, nod: 0.8 }[name] || 1;
      S.triggers.push({ name, t: 0, d });
    },
    setHidden(h) { S.hiddenForced = h; },
    lookAt(v) { S.look = v ? v.clone() : null; },
    setSealed(v) { S.sealed = v; cork.visible = v; },
    setPerch(v) { S.perchT = v; },
    mouthWorld(out = new THREE.Vector3()) { return yaw.localToWorld(out.copy(mouth)); },
    update(dt, t) {
      // expression blending
      for (const k in S.w) S.w[k] = damp(S.w[k], S.expr === k ? 1 : 0, 7, dt);
      const W = S.w;
      // trigger contributions
      let hide = S.hiddenForced ? 1 : 0, jump = 0, sway = 0, armsUp = 0, wave = 0, click = 0, nod = 0;
      S.triggers = S.triggers.filter((tr) => {
        tr.t += dt; const p = tr.t / tr.d;
        if (tr.name === 'hide') hide = Math.max(hide, p < 0.25 ? easeOut(p / 0.25) : p > 0.75 ? 1 - easeOut((p - 0.75) / 0.25) : 1);
        if (tr.name === 'peek') hide = Math.max(hide, 0.6 * bump(p));
        if (tr.name === 'cheer') { jump = Math.max(jump, bump(Math.min(1, p * 1.6)) * 0.22); armsUp = Math.max(armsUp, bump(p)); click = Math.max(click, bump(p * 3 % 1)); }
        if (tr.name === 'dance') { sway += Math.sin(p * Math.PI * 6) * bump(p); armsUp = Math.max(armsUp, 0.6 * bump(p)); jump = Math.max(jump, Math.abs(Math.sin(p * Math.PI * 6)) * 0.08 * bump(p)); }
        if (tr.name === 'wave') wave = Math.max(wave, bump(p));
        if (tr.name === 'click') click = Math.max(click, bump(p * 2 % 1));
        if (tr.name === 'nod') nod = Math.max(nod, bump(p));
        return p < 1;
      });
      S.hide = damp(S.hide, hide, 14, dt);

      // body
      const breathe = Math.sin(t * (W.sleepy > 0.5 ? 1.2 : 2.2)) * 0.025;
      const bounce = W.happy * Math.abs(Math.sin(t * 7)) * 0.05;
      body.position.y = breathe * 0.5 + bounce + jump - W.sleepy * 0.05 - nod * 0.04;
      body.scale.set(1, 1 + breathe, 1);
      body.rotation.z = sway * 0.28 + W.happy * Math.sin(t * 7) * 0.06;
      body.rotation.x = W.sleepy * 0.18 + nod * 0.25 - W.surprised * 0.12;
      S.perch = damp(S.perch, S.perchT, 4.5, dt);
      const back = (S.hide * 0.62 + W.surprised * 0.12) * (1 - S.perch);
      seatTmp.copy(seat).lerp(seatTop, S.perch);
      seatTmp.y += bump(S.perch) * 0.35;
      pip.position.copy(seatTmp).addScaledVector(dir, -back);
      pip.rotation.y = 0.45 - S.perch * 0.3;
      const sc = 1 - S.hide * 0.45;
      pip.scale.setScalar(sc);
      pip.visible = S.hide < 0.98;

      // eyes: saccades, look-at, blink
      if (t > S.nextSac) {
        S.nextSac = t + rand(0.8, 3.2);
        S.sacTL.set(rand(-0.5, 0.5), rand(-0.35, 0.3));
        S.sacTR.set(Math.random() < 0.7 ? S.sacTL.x + rand(-0.15, 0.15) : rand(-0.5, 0.5), S.sacTL.y + rand(-0.15, 0.15));
      }
      let lx = S.sacTL.x, ly = S.sacTL.y, rx = S.sacTR.x, ry = S.sacTR.y;
      if (S.look) {
        pip.worldToLocal(worldTmp.copy(S.look));
        const yawT = Math.atan2(worldTmp.x, worldTmp.z), pitchT = Math.atan2(worldTmp.y - 0.5, Math.hypot(worldTmp.x, worldTmp.z));
        lx = rx = THREE.MathUtils.clamp(yawT, -0.9, 0.9); ly = ry = THREE.MathUtils.clamp(-pitchT, -0.9, 0.6);
      }
      S.sacL.x = damp(S.sacL.x, lx, 18, dt); S.sacL.y = damp(S.sacL.y, ly, 18, dt);
      S.sacR.x = damp(S.sacR.x, rx, 18, dt); S.sacR.y = damp(S.sacR.y, ry, 18, dt);
      const droop = W.sleepy * 0.85;
      const len = 1 + W.surprised * 0.28 + W.happy * 0.08;
      eyeL.stalk.rotation.set(0.1 + droop + S.sacL.y * 0.35 - W.surprised * 0.2, S.sacL.x * 0.5, 0.22 + W.happy * 0.18 + W.surprised * 0.12);
      eyeR.stalk.rotation.set(0.1 + droop * 0.8 + S.sacR.y * 0.35 - W.surprised * 0.2, S.sacR.x * 0.5, -0.22 - W.happy * 0.18 - W.surprised * 0.12);
      eyeL.stalk.scale.y = eyeR.stalk.scale.y = len;
      eyeL.pupil.rotation.set(S.sacL.y * 0.5, S.sacL.x * 0.7, 0); eyeR.pupil.rotation.set(S.sacR.y * 0.5, S.sacR.x * 0.7, 0);
      const ps = 1 - W.surprised * 0.35 + W.happy * 0.08;
      eyeL.pupil.scale.setScalar(ps); eyeR.pupil.scale.setScalar(ps);
      if (t > S.nextBlink && S.blinkT < 0) { S.blinkT = 0; S.nextBlink = t + rand(2.2, 5.5); }
      let blink = 0;
      if (S.blinkT >= 0) { S.blinkT += dt; blink = bump(S.blinkT / 0.16); if (S.blinkT > 0.16) S.blinkT = -1; }
      const lidOpen = -0.75 - W.surprised * 0.5;
      const lidBase = lidOpen * (1 - W.happy - W.sleepy) + 0.55 * W.happy + 1.0 * W.sleepy;
      const lidSlow = W.sleepy * 0.35 * (0.5 + 0.5 * Math.sin(t * 0.9));
      const lid = THREE.MathUtils.lerp(lidBase + lidSlow, 1.6, blink);
      eyeL.lid.rotation.x = lid; eyeR.lid.rotation.x = THREE.MathUtils.lerp(lidBase + lidSlow * 0.7, 1.6, blink);

      // antennae
      antL.rotation.set(Math.sin(t * 2.3) * 0.15, Math.sin(t * 1.7) * 0.2, 0);
      antR.rotation.set(Math.sin(t * 2.1 + 1) * 0.15, Math.sin(t * 1.5 + 2) * 0.2, 0);

      // claws: idle click, glass tap, poses
      if (t > S.nextClick && S.clickT < 0) { S.clickT = 0; S.nextClick = t + rand(5, 10); }
      let idleClick = 0;
      if (S.clickT >= 0) { S.clickT += dt; idleClick = bump((S.clickT / 0.25) % 1); if (S.clickT > 0.5) S.clickT = -1; }
      if (t > S.nextTap && S.tapT < 0 && W.idle > 0.8 && S.hide < 0.1) { S.tapT = 0; S.nextTap = t + rand(9, 16); }
      let tap = 0;
      if (S.tapT >= 0) {
        S.tapT += dt; const p = S.tapT / 1.2; tap = bump(p);
        if (Math.abs(S.tapT - 0.45) < dt || Math.abs(S.tapT - 0.75) < dt) { S.wobVX += 0.35; S.ripple = Math.max(S.ripple, 0.5); }
        if (S.tapT > 1.2) S.tapT = -1;
      }
      const up = Math.max(armsUp, W.happy * 0.9, W.surprised * 0.5);
      clawR.shoulder.rotation.set(-0.5 - up * 0.9 - wave * 0.8 + tap * 0.4, tap * 0.9 + wave * Math.sin(t * 14) * 0.5, -0.35 + up * 1.2 + wave * 1.1 - W.sleepy * 0.25);
      clawL.shoulder.rotation.set(-0.5 - up * 0.9, 0, 0.35 - up * 1.2 + W.sleepy * 0.25);
      clawR.elbow.rotation.set(-0.3 - up * 0.4, 0, 0);
      clawL.elbow.rotation.set(-0.3 - up * 0.4, 0, 0);
      const open = Math.max(idleClick, click, W.surprised * 0.9, W.happy * 0.4 * (0.5 + 0.5 * Math.sin(t * 9)));
      clawR.dact.rotation.x = -0.65 * open; clawL.dact.rotation.x = -0.65 * Math.max(open, idleClick * 0.5);
      legs.forEach((L, i) => { L.hip.rotation.z = Math.sin(t * 3 + i) * 0.06 * (1 + W.happy * 2); L.knee.rotation.z = 0.1 * L.side; });

      // liquid
      S.fill.step(dt);
      const fv = Math.max(0, Math.min(1.02, S.fill.v));
      liquid.updateMatrixWorld(true);
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < liqPos.count; i += 3) {
        worldTmp.fromBufferAttribute(liqPos, i).applyMatrix4(liquid.matrixWorld);
        if (worldTmp.y < minY) minY = worldTmp.y; if (worldTmp.y > maxY) maxY = worldTmp.y;
      }
      liquid.getWorldPosition(tmp2);
      // wobble spring
      const k = 55, dmp = 3.2;
      S.wobVX += (-k * S.wobX - dmp * S.wobVX) * dt; S.wobX += S.wobVX * dt;
      S.wobVZ += (-k * S.wobZ - dmp * S.wobVZ) * dt; S.wobZ += S.wobVZ * dt;
      S.wobVX += -S.fill.vel * 0.02;
      S.ripple = Math.max(0, S.ripple - dt * 0.6);
      const U = liqMat.uniforms;
      U.uFill.value = minY + (maxY - minY) * fv;
      U.uWob.value.set(S.wobX * 0.12, S.wobZ * 0.12);
      U.uCenter.value.copy(tmp2);
      U.uTime.value = t; U.uRipple.value = S.ripple;
      U.uRipplePos.value.set(tmp2.x, tmp2.z);
      U.uOn.value = fv > 0.003 ? 1 : 0;
    }
  };
  api.setFill(fill, true);
  // lift so the bottle rests on y = 0
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(glassFront);
  yaw.position.y = -box.min.y;
  return api;
}

/* ------------------------------------------------------------------ *
 *  CONCEPT B: MOSS, a marimo lake ball that floats when it's full    *
 * ------------------------------------------------------------------ */
export function buildMoss({ fill = 0.45 } = {}) {
  const root = new THREE.Group();
  const holder = new THREE.Group(); root.add(holder);
  const ball = new THREE.Group(); holder.add(ball);
  const geo = new THREE.SphereGeometry(0.9, 64, 40);
  const core = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x24502c, roughness: 1 }));
  ball.add(core);
  const N = 18;
  const shells = [];
  for (let i = 1; i <= N; i++) {
    const L = i / N;
    const m = new THREE.ShaderMaterial({
      uniforms: { uL: { value: L }, uTime: { value: 0 }, uWig: { value: 0 }, uA: { value: new THREE.Color(0x1f4a28) }, uB: { value: new THREE.Color(0x8fbf5a) }, uLight: { value: new THREE.Vector3(0.4, 0.85, 0.5).normalize() } },
      vertexShader: `uniform float uL, uTime, uWig; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec3 p = position + normal * (uL * 0.2);
          float w = uL * uL;
          p += vec3(sin(uTime * 1.4 + position.y * 4.0), cos(uTime * 1.1 + position.x * 3.0), cos(uTime * 1.2 + position.z * 4.0)) * 0.025 * w * (1.0 + uWig * 5.0);
          vec4 wp = modelMatrix * vec4(p, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uL; uniform vec3 uA, uB, uLight; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){ vec2 st = vUv * vec2(170.0, 90.0); vec2 id = floor(st); float h = hash(id);
          vec2 f = fract(st) - 0.5; float r = length(f);
          if (h < uL || r > (1.0 - uL) * 0.7 + 0.08) discard;
          vec3 n = normalize(vN); float dif = max(dot(n, uLight), 0.0) * 0.75 + 0.35;
          float rim = pow(1.0 - max(dot(n, vV), 0.0), 3.0) * 0.6;
          vec3 c = mix(uA, uB, uL * (0.6 + 0.4 * h)) * dif * (0.45 + 0.55 * uL) + rim * vec3(0.7, 0.9, 0.55) * uL;
          gl_FragColor = vec4(c, 1.0); ${CS} }`
    });
    const s = new THREE.Mesh(geo, m); ball.add(s); shells.push(m);
  }
  const face = new THREE.Group(); holder.add(face);
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0d1a12, roughness: 0.05, clearcoat: 1 });
  const hiM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyes = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(0.3 * s, 0.14, 1.0); face.add(g);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), black); e.scale.z = 0.6; g.add(e);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), hiM); h.position.set(0.04 * s, 0.04, 0.07); g.add(h);
    return g;
  });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 20, Math.PI), black);
  smile.rotation.z = Math.PI; smile.position.set(0, -0.06, 1.06); face.add(smile);
  const oh = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 20), black); oh.position.set(0, -0.08, 1.06); face.add(oh);
  const bubMat = glassMaterial({ tint: 0xe8fffb, opacity: 0.12 });
  const bubbles = [];
  for (let i = 0; i < 16; i++) {
    const th = rand(-1.3, 1.3), ph = rand(0.15, 1.35);
    const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.05, 0.1), 16, 12), bubMat);
    b.position.set(Math.sin(th) * Math.sin(ph) * 1.13, Math.cos(ph) * 1.13, Math.cos(th) * Math.sin(ph) * 1.13 * 0.8);
    b.renderOrder = 4; ball.add(b); bubbles.push(b);
  }
  const S = { expr: 'idle', w: { idle: 1, happy: 0, surprised: 0, sleepy: 0 }, triggers: [], wig: 0, fill: new Spring(fill, 30, 7), nextBlink: 2, blinkT: -1 };
  root.position.y = 1.1;
  return {
    root,
    setFill(f, inst) { S.fill.target = f; if (inst) S.fill.v = f; },
    setExpression(e) { S.expr = e; },
    trigger(name, dur) { S.triggers.push({ name, t: 0, d: dur || 1.2 }); if (name === 'pour') S.wig = 1; },
    impulse() { S.wig = 1; },
    update(dt, t) {
      for (const k in S.w) S.w[k] = damp(S.w[k], S.expr === k ? 1 : 0, 6, dt);
      const W = S.w; S.fill.step(dt);
      let hop = 0, spin = 0, lift = 0;
      S.triggers = S.triggers.filter((tr) => { tr.t += dt; const p = tr.t / tr.d;
        if (tr.name === 'pour' || tr.name === 'cheer') { hop = Math.max(hop, bump(p) * 0.35); lift = Math.max(lift, bump(p) * 0.2); }
        if (tr.name === 'dance') spin += bump(p) * Math.PI * 2 * p;
        return p < 1; });
      S.wig = Math.max(0, S.wig - dt * 1.2);
      const bob = Math.sin(t * 1.3) * 0.05 + W.happy * Math.abs(Math.sin(t * 5)) * 0.18;
      const floatUp = S.fill.v * 0.35 - W.sleepy * 0.25;
      holder.position.y = bob + hop + floatUp + lift;
      const squash = W.happy * Math.max(0, -Math.cos(t * 10)) * 0.08;
      const sx = 1 + squash - W.surprised * 0.07 + W.sleepy * 0.04, sy = 1 - squash + W.surprised * 0.14 - W.sleepy * 0.08;
      holder.scale.set(sx, sy, sx);
      ball.rotation.y = t * 0.15 + spin; ball.rotation.x = Math.sin(t * 0.4) * 0.15;
      face.rotation.y = Math.sin(t * 0.5) * 0.18 * W.idle;
      if (t > S.nextBlink && S.blinkT < 0) { S.blinkT = 0; S.nextBlink = t + rand(2, 5); }
      let blink = 0; if (S.blinkT >= 0) { S.blinkT += dt; blink = bump(S.blinkT / 0.15); if (S.blinkT > 0.15) S.blinkT = -1; }
      const ey = Math.max(0.08, (1 - blink) * (1 - W.happy * 0.65 - W.sleepy * 0.85) * (1 + W.surprised * 0.35));
      eyes.forEach((e) => { e.scale.set(1 + W.surprised * 0.3, ey, 1); e.position.y = 0.14 + W.happy * 0.04; });
      smile.scale.setScalar(Math.max(0.001, 1 - W.surprised) * (1 + W.happy * 0.5));
      oh.scale.setScalar(Math.max(0.001, W.surprised));
      shells.forEach((m) => { m.uniforms.uTime.value = t; m.uniforms.uWig.value = S.wig + W.happy * 0.2; });
      const vis = Math.round(S.fill.v * bubbles.length);
      bubbles.forEach((b, i) => { b.visible = i < vis; b.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.06); });
    }
  };
}

/* ------------------------------------------------------------------ *
 *  CONCEPT C: FOLD, an origami boat-bird made from a postcard        *
 * ------------------------------------------------------------------ */
export function buildFold() {
  const root = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.82, flatShading: true, side: THREE.DoubleSide });
  const print = new THREE.MeshStandardMaterial({ color: 0x7fc4bb, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
  const stampM = new THREE.MeshStandardMaterial({ color: 0xc0523a, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
  const inkM = new THREE.MeshBasicMaterial({ color: 0x13303a, side: THREE.DoubleSide });
  const tri = (pts, m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, m);
  };
  const body = new THREE.Group(); root.add(body);
  const K1 = [-0.75, 0, 0], K2 = [0.75, 0, 0], B = [1.3, 0.55, 0], St = [-1.3, 0.55, 0];
  [1, -1].forEach((s) => {
    const M = [0, 0.5, 0.42 * s];
    body.add(tri([K1, K2, M], paper), tri([K2, B, M], paper), tri([K1, M, St], paper));
  });
  body.add(tri([[-0.62, 0.5, 0.12], [0.62, 0.5, 0.12], [0, 1.28, 0]], print));
  body.add(tri([[-0.62, 0.5, -0.12], [0.62, 0.5, -0.12], [0, 1.28, 0]], print));
  body.add(tri([[0.12, 0.72, 0.1], [0.34, 0.72, 0.1], [0.23, 0.95, 0.07]], stampM));
  const tail = new THREE.Group(); tail.position.set(-1.25, 0.55, 0); body.add(tail);
  tail.add(tri([[0, 0, 0.03], [-0.35, 0.55, 0], [0.12, 0.08, 0]], paper), tri([[0, 0, -0.03], [-0.35, 0.55, 0], [0.12, 0.08, 0]], paper));
  const neck = new THREE.Group(); neck.position.set(1.05, 0.5, 0); body.add(neck);
  neck.add(tri([[0, 0, 0.06], [0.25, 0.05, 0], [0.42, 0.75, 0]], paper), tri([[0, 0, -0.06], [0.25, 0.05, 0], [0.42, 0.75, 0]], paper));
  const head = new THREE.Group(); head.position.set(0.42, 0.75, 0); neck.add(head);
  head.add(tri([[0, 0, 0], [-0.12, -0.06, 0.07], [0.32, -0.1, 0]], paper), tri([[0, 0, 0], [-0.12, -0.06, -0.07], [0.32, -0.1, 0]], paper));
  [1, -1].forEach((s) => { const e = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), inkM); e.position.set(0.02, -0.035, 0.05 * s); if (s < 0) e.rotation.y = Math.PI; head.add(e); });
  const wings = [1, -1].map((s) => {
    const w = new THREE.Group(); w.position.set(0, 0.62, 0.3 * s); body.add(w);
    w.add(tri([[-0.5, 0, 0], [0.45, 0, 0], [-0.15, 0, 0.9 * s]], paper));
    w.add(tri([[-0.15, 0, 0.9 * s], [0.45, 0, 0], [0.25, 0, 0.55 * s]], print));
    return { w, s };
  });
  const S = { expr: 'idle', w: { idle: 1, happy: 0, surprised: 0, sleepy: 0 }, triggers: [], nextLook: 1, lookT: 0, look: 0 };
  root.position.y = 0.1;
  return {
    root,
    setFill() {}, impulse() {},
    setExpression(e) { S.expr = e; },
    trigger(name, dur) { S.triggers.push({ name, t: 0, d: dur || 1.4 }); },
    update(dt, t) {
      for (const k in S.w) S.w[k] = damp(S.w[k], S.expr === k ? 1 : 0, 6, dt);
      const W = S.w;
      let hop = 0, spin = 0, flapBoost = 0;
      S.triggers = S.triggers.filter((tr) => { tr.t += dt; const p = tr.t / tr.d;
        if (tr.name === 'pour' || tr.name === 'cheer') { hop = Math.max(hop, bump(p) * 0.45); flapBoost = Math.max(flapBoost, bump(p)); }
        if (tr.name === 'dance') spin += easeInOut(p) * Math.PI * 2;
        return p < 1; });
      if (t > S.nextLook) { S.nextLook = t + rand(1.5, 3.5); S.look = rand(-0.5, 0.5); }
      body.position.y = Math.sin(t * 1.6) * 0.05 + hop + W.happy * Math.abs(Math.sin(t * 6)) * 0.12 - W.sleepy * 0.04;
      body.rotation.x = Math.sin(t * 1.3) * 0.06; body.rotation.z = Math.sin(t * 1.1) * 0.04 - W.surprised * 0.15;
      body.rotation.y = spin + Math.sin(t * 0.4) * 0.1;
      const flapSpeed = 2 + W.happy * 14 + flapBoost * 16;
      const flap = Math.sin(t * flapSpeed) * (0.12 + W.happy * 0.5 + flapBoost * 0.6);
      wings.forEach(({ w, s }) => { w.rotation.x = s * (-(0.15 + W.surprised * 1.1 + flap) + W.sleepy * 0.5); });
      neck.rotation.z = -W.sleepy * 1.3 + W.surprised * 0.35 + W.happy * 0.15 + Math.sin(t * 1.7) * 0.05;
      neck.rotation.y = damp(neck.rotation.y, S.look * W.idle, 5, dt);
      head.rotation.z = Math.sin(t * 2.2) * 0.08 * W.idle + W.happy * 0.3 - W.sleepy * 0.3;
      tail.rotation.z = Math.sin(t * 3) * 0.08 + W.happy * 0.2;
    }
  };
}

// Simple studio set for concept line-ups
export function studioSet(scene) {
  const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color(0xd6eee8) }, uBot: { value: new THREE.Color(0x3d7c82) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop, uBot; varying vec3 vP; void main(){ float h = smoothstep(-0.25, 0.55, vP.y); gl_FragColor = vec4(mix(uBot, uTop, h), 1.0); ${CS} }`
  }));
  scene.add(bg);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vP; void main(){ float d = length(vP) / 14.0; vec3 sand = vec3(0.86, 0.80, 0.68); vec3 far = vec3(0.30, 0.52, 0.54);
      gl_FragColor = vec4(mix(sand, far, smoothstep(0.15, 1.0, d)), 1.0); ${CS} }`
  }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  return { bg, floor };
}

export function blobShadow(radius = 1, opacity = 0.28) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uO: { value: opacity } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.05, 0.15, 0.18, uO * smoothstep(1.0, 0.0, d)); }`
  }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.01; m.renderOrder = 0;
  return m;
}
