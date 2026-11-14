/**
 * The 250 ml pour: water rushes from the bamboo spout in a real ballistic arc, its leading
 * edge falling under gravity; it lands with a churn of foam, splashing droplets, bubbles
 * under the surface and rings of ripples; the level rises while it pours, and the stream
 * thins, breaks from the spout and falls away at the end.
 *
 * The stream is one mesh bent along the arc in the vertex shader, so it costs one draw call.
 */
import * as THREE from 'three';
import { GLSL_NOISE } from './noise';
import { OUTPUT, shared } from './shared';
import type { Water } from './water';

export const POUR_SECONDS = 2.3;
const SPEED = 1.55;
const GRAVITY = 4.6;

export type PourEvent = 'impact' | 'done';

export interface Pour {
  group: THREE.Group;
  readonly active: boolean;
  /** 0..1: how much of this glass has reached the spring (drives the level). */
  readonly fill: number;
  /** Stream strength right now, 0..1. */
  readonly flow: number;
  impact: THREE.Vector3;
  start(reduced: boolean): void;
  /** Throw droplets from a point (water shaken off Ripple at the top of a jump). */
  fling(at: THREE.Vector3, count: number): void;
  /**
   * A short trickle from the spout (tapping it). Droplets only: it never starts a pour, never
   * changes `fill`, and the scene logs nothing for it.
   */
  spill(seconds: number): void;
  /** Seconds of trickle still to come. */
  readonly spilling: number;
  update(dt: number, water: Water): PourEvent[];
}

export function buildPour(mouth: THREE.Vector3, dir: THREE.Vector3, droplets: number): Pour {
  const group = new THREE.Group();
  const V = dir.clone().multiplyScalar(SPEED);
  const ALONG = 56;
  const AROUND = 12;
  const aS: number[] = [];
  const aA: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= ALONG; i++) {
    for (let j = 0; j <= AROUND; j++) {
      aS.push(i / ALONG);
      aA.push((j / AROUND) * Math.PI * 2);
      if (i < ALONG && j < AROUND) {
        const a = i * (AROUND + 1) + j;
        const b = a + AROUND + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(aS.length * 3).fill(0), 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aA', new THREE.Float32BufferAttribute(aA, 1));
  g.setIndex(idx);
  const u = {
    uTime: shared.uTime,
    uSunDir: shared.uSunDir,
    uSunColor: shared.uSunColor,
    uSky: shared.uSky,
    uP0: { value: mouth.clone() },
    uV: { value: V },
    uG: { value: GRAVITY },
    uT: { value: 0.7 },
    uR: { value: 0.052 },
    uHead: { value: 0 },
    uTail: { value: 0 },
    uFlow: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aS; attribute float aA;
      uniform vec3 uP0, uV; uniform float uG, uT, uR, uHead, uTail, uFlow, uTime;
      varying vec3 vN; varying vec3 vW; varying float vS; varying float vA;
      void main(){
        float t = aS * uT;
        vec3 c = uP0 + uV * t + vec3(0.0, -0.5 * uG * t * t, 0.0);
        vec3 tng = normalize(uV + vec3(0.0, -uG * t, 0.0));
        vec3 side = normalize(vec3(-uV.z, 0.0, uV.x));
        vec3 up2 = normalize(cross(side, tng));
        float vis = smoothstep(uTail, uTail + 0.05, aS) * (1.0 - smoothstep(uHead - 0.05, uHead, aS));
        float wob = 1.0 + 0.2 * sin(aS * 46.0 - uTime * 32.0) * aS + 0.1 * sin(aA * 3.0 + uTime * 20.0) * aS;
        float r = uR * uFlow * vis * (1.0 - 0.42 * aS) * wob;
        vec3 n = side * cos(aA) + up2 * sin(aA);
        vec3 p = c + n * r;
        vN = n; vW = p; vS = aS; vA = aA;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFlow; uniform vec3 uSunDir, uSunColor, uSky;
      varying vec3 vN; varying vec3 vW; varying float vS; varying float vA;
      ${GLSL_NOISE}
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        float ndv = abs(dot(n, v));
        float fres = pow(1.0 - ndv, 2.2);
        float streak = smoothstep(0.5, 0.92, lab_noise(vec3(vA * 2.5, vS * 26.0 - uTime * 15.0, 1.0)));
        float fine = smoothstep(0.6, 0.95, lab_noise(vec3(vA * 6.0, vS * 70.0 - uTime * 30.0, 4.0)));
        vec3 h = normalize(uSunDir + v);
        float spec = pow(max(dot(n, h), 0.0), 80.0) * 1.5;
        vec3 col = vec3(0.32, 0.66, 0.7) * 0.5 + uSky * fres * 0.9 + vec3(1.0) * (streak * 0.55 + fine * 0.35) + uSunColor * spec;
        // Glints of sun running down the falling water.
        float glint = step(0.93, lab_noise(vec3(vA * 4.0, vS * 40.0 - uTime * 22.0, 7.0))) * pow(max(dot(n, h), 0.0), 8.0);
        col += uSunColor * glint * 1.6;
        float a = clamp(0.42 + 0.45 * fres + streak * 0.35 + fine * 0.2 + glint * 0.3, 0.0, 0.95);
        gl_FragColor = vec4(col, a);
        ${OUTPUT}
      }`
  });
  const stream = new THREE.Mesh(g, mat);
  stream.frustumCulled = false;
  stream.renderOrder = 4;
  stream.visible = false;
  group.add(stream);

  // Foam where the stream lands.
  const foamU = { uTime: shared.uTime, uA: { value: 0 } };
  const foam = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 40),
    new THREE.ShaderMaterial({
      uniforms: foamU,
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uA; varying vec2 vP; ${GLSL_NOISE}
        void main(){
          float r = length(vP) / 0.42;
          float ang = atan(vP.y, vP.x);
          float churn = lab_fbm(vec3(vP * 9.0 + vec2(0.0, uTime * 0.0), uTime * 2.2)) ;
          float ring = smoothstep(0.15, 0.6, churn + 0.35 * (1.0 - r)) * (1.0 - smoothstep(0.45, 1.0, r));
          float bub = step(0.8, lab_noise(vec3(vP * 40.0, uTime * 3.0))) * (1.0 - r);
          float a = (ring * 0.8 + bub * 0.5) * uA;
          gl_FragColor = vec4(vec3(0.96, 0.99, 1.0), a);
          #include <colorspace_fragment>
        }`
    })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.renderOrder = 3;
  foam.visible = false;
  group.add(foam);

  // Splash droplets above the surface; bubbles below it.
  // Spray: a soft, rising haze over the churn while the water runs (a camera-facing sprite).
  const mistU = { uTime: shared.uTime, uA: { value: 0 } };
  const mist = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.7),
    new THREE.ShaderMaterial({
      uniforms: mistU,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv;
        void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy; gl_Position = projectionMatrix * c; }`,
      fragmentShader: /* glsl */ `uniform float uTime, uA; varying vec2 vUv; ${GLSL_NOISE}
        void main(){
          vec2 q = vUv - vec2(0.5, 0.3);
          float r = length(q * vec2(1.0, 0.8));
          float n = lab_fbm(vec3(vUv * 4.0 + vec2(0.0, -uTime * 0.6), uTime * 0.3));
          float a = (1.0 - smoothstep(0.1, 0.5, r)) * smoothstep(0.3, 0.7, n) * uA * 0.35;
          gl_FragColor = vec4(vec3(0.94, 0.98, 1.0), a);
          #include <colorspace_fragment>
        }`
    })
  );
  mist.visible = false;
  mist.renderOrder = 5;
  group.add(mist);

  const dropMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.88, 0.98, 1.0),
    transparent: true,
    opacity: 0.9
  });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), dropMat, droplets);
  drops.frustumCulled = false;
  drops.renderOrder = 4;
  const dState = Array.from({ length: droplets }, () => ({
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    life: 0,
    s: 0,
    /** Trickle drops ring the water more often where they land. */
    rip: false
  }));
  const bubMat = new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.55 });
  const BUBBLES = 28;
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), bubMat, BUBBLES);
  bubbles.frustumCulled = false;
  const bState = Array.from({ length: BUBBLES }, () => ({
    p: new THREE.Vector3(),
    life: 0,
    s: 0,
    ph: Math.random() * 6
  }));
  group.add(drops, bubbles);
  const m = new THREE.Matrix4();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < droplets; i++) drops.setMatrixAt(i, hide);
  for (let i = 0; i < BUBBLES; i++) bubbles.setMatrixAt(i, hide);

  const impact = new THREE.Vector3();
  let t = -1;
  let flight = 0.7;
  let reduced = false;
  let impacted = false;
  let fill = 0;
  let rippleT = 0;
  let emitAcc = 0;
  let bubAcc = 0;
  let dNext = 0;
  let bNext = 0;
  let spillLeft = 0;
  let spillAcc = 0;
  const jitter = new THREE.Vector3();

  const flightTime = (level: number) => {
    const dy = mouth.y - level;
    return (V.y + Math.sqrt(V.y * V.y + 2 * GRAVITY * dy)) / GRAVITY;
  };

  return {
    group,
    get active() {
      return t >= 0;
    },
    get fill() {
      return fill;
    },
    get flow() {
      return t >= 0 ? u.uFlow.value : 0;
    },
    impact,
    fling(at, count) {
      for (let c = 0; c < count; c++) {
        const d = dState[dNext]!;
        dNext = (dNext + 1) % dState.length;
        const a = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 0.8;
        d.p.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.25, (Math.random() - 0.3) * 0.3, Math.sin(a) * 0.25));
        d.v.set(Math.cos(a) * sp, 0.6 + Math.random() * 1.1, Math.sin(a) * sp);
        d.life = 1;
        d.s = 0.01 + Math.random() * 0.012;
        d.rip = false;
      }
    },
    get spilling() {
      return spillLeft;
    },
    spill(seconds) {
      spillLeft = Math.max(spillLeft, seconds);
    },
    start(r) {
      reduced = r;
      t = 0;
      impacted = false;
      fill = 0;
      stream.visible = true;
    },
    update(dt, water) {
      const ev: PourEvent[] = [];
      const level = shared.uLevel.value;
      if (t >= 0) {
        t += dt;
        flight = flightTime(level);
        u.uT.value = flight;
        const tt = flight * 1;
        impact.set(mouth.x + V.x * tt, level, mouth.z + V.z * tt);
        u.uHead.value = Math.min(1.05, t / flight);
        const end = POUR_SECONDS;
        const k = Math.min(1, t / 0.22) * (1 - THREE.MathUtils.smoothstep(t, end - 0.4, end));
        u.uFlow.value = k;
        u.uTail.value = t > end - 0.15 ? Math.min(1.05, (t - (end - 0.15)) / flight) : 0;
        if (!impacted && t >= flight) {
          impacted = true;
          ev.push('impact');
          water.addRipple(impact.x, impact.z, 1.4);
          // The first hit throws up a crown: a ring of droplets, higher than the steady splash.
          if (!reduced) {
            for (let c = 0; c < 26; c++) {
              const d = dState[dNext]!;
              dNext = (dNext + 1) % dState.length;
              const a = (c / 26) * Math.PI * 2 + Math.random() * 0.15;
              const sp = 0.9 + Math.random() * 0.5;
              d.p.set(impact.x + Math.cos(a) * 0.07, level + 0.01, impact.z + Math.sin(a) * 0.07);
              d.v.set(Math.cos(a) * sp, 1.7 + Math.random() * 0.7, Math.sin(a) * sp);
              d.life = 1;
              d.rip = false;
              d.s = 0.012 + Math.random() * 0.012;
            }
          }
          if (!reduced) water.slosh(impact.x, impact.z, 0.012);
        }
        const flowing = impacted && u.uTail.value < 1;
        fill = THREE.MathUtils.smoothstep(t, flight, end + flight * 0.6);
        if (flowing) {
          rippleT -= dt;
          if (rippleT <= 0) {
            rippleT = reduced ? 0.45 : 0.13;
            water.addRipple(
              impact.x + (Math.random() - 0.5) * 0.08,
              impact.z + (Math.random() - 0.5) * 0.08,
              (reduced ? 0.5 : 0.7) + Math.random() * 0.4
            );
          }
          if (!reduced) {
            emitAcc += dt * 70 * k;
            while (emitAcc >= 1) {
              emitAcc -= 1;
              const d = dState[dNext]!;
              dNext = (dNext + 1) % dState.length;
              const a = Math.random() * Math.PI * 2;
              const sp = 0.4 + Math.random() * 0.9;
              d.p.set(impact.x + Math.cos(a) * 0.04, level + 0.01, impact.z + Math.sin(a) * 0.04);
              d.v.set(Math.cos(a) * sp + V.x * 0.25, 0.9 + Math.random() * 1.3, Math.sin(a) * sp + V.z * 0.25);
              d.life = 1;
              d.rip = false;
              d.s = 0.009 + Math.random() * 0.016;
            }
          }
          bubAcc += dt * 26 * k;
          while (bubAcc >= 1) {
            bubAcc -= 1;
            const b = bState[bNext]!;
            bNext = (bNext + 1) % bState.length;
            b.p.set(
              impact.x + (Math.random() - 0.5) * 0.25,
              level - 0.15 - Math.random() * 0.35,
              impact.z + (Math.random() - 0.5) * 0.25
            );
            b.life = 1;
            b.s = 0.008 + Math.random() * 0.018;
          }
        }
        foam.visible = impacted;
        foam.position.set(impact.x, level + 0.006, impact.z);
        mist.visible = impacted && !reduced;
        mist.position.set(impact.x, level + 0.12, impact.z);
        mistU.uA.value = impacted ? k : 0;
        foamU.uA.value = impacted ? Math.max(0, k) * 0.95 : 0;
        if (t > end + flight + 0.35) {
          t = -1;
          stream.visible = false;
          foam.visible = false;
          mist.visible = false;
          fill = 1;
          ev.push('done');
        }
      }
      if (spillLeft > 0) {
        // A thin, breaking trickle: strongest at first, thinning as it runs out.
        spillLeft = Math.max(0, spillLeft - dt);
        spillAcc += dt * (18 + 40 * Math.min(1, spillLeft));
        while (spillAcc >= 1) {
          spillAcc -= 1;
          const d = dState[dNext]!;
          dNext = (dNext + 1) % dState.length;
          d.p.copy(mouth).addScaledVector(dir, 0.03);
          jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.08);
          d.v
            .copy(V)
            .multiplyScalar(0.42 + Math.random() * 0.12)
            .add(jitter);
          d.life = 1;
          d.s = 0.011 + Math.random() * 0.008;
          d.rip = true;
        }
      } else spillAcc = 0;
      let anyDrop = false;
      dState.forEach((d, i) => {
        if (d.life <= 0) return;
        d.v.y -= GRAVITY * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < level && d.v.y < 0) {
          d.life = 0;
          if (Math.random() < (d.rip ? 0.3 : 0.15)) water.addRipple(d.p.x, d.p.z, d.rip ? 0.35 : 0.25);
          drops.setMatrixAt(i, hide);
          return;
        }
        anyDrop = true;
        m.makeScale(d.s, d.s * (1 + Math.min(1.5, Math.abs(d.v.y) * 0.6)), d.s).setPosition(d.p);
        drops.setMatrixAt(i, m);
      });
      drops.instanceMatrix.needsUpdate = true;
      drops.visible = anyDrop;
      let anyBub = false;
      bState.forEach((b, i) => {
        if (b.life <= 0) return;
        b.p.y += dt * (0.35 + b.s * 10);
        b.p.x += Math.sin(shared.uTime.value * 6 + b.ph) * dt * 0.05;
        if (b.p.y > level - 0.01) {
          b.life = 0;
          bubbles.setMatrixAt(i, hide);
          return;
        }
        anyBub = true;
        m.makeScale(b.s, b.s, b.s).setPosition(b.p);
        bubbles.setMatrixAt(i, m);
      });
      bubbles.instanceMatrix.needsUpdate = true;
      bubbles.visible = anyBub;
      return ev;
    }
  };
}
