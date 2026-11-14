/**
 * The spring's surface. One shader does what a clear spring does:
 *  - refraction: the pool floor, pebbles and fish, bent by the surface (from a texture of
 *    the scene drawn without the water, with a depth texture so objects in front don't smear),
 *  - absorption by depth: shallow water is clear, deep water turns teal, as red light goes first,
 *  - Fresnel reflection of the sky and the dark banks, with sun sparkle,
 *  - soft foam where water meets stone,
 *  - ripples: up to 16 expanding rings (taps, drips, the pour) plus a slosh wave when the level jumps.
 * The vertices move too, so the shoreline itself rises, falls and laps.
 */
import * as THREE from 'three';
import { GLSL_NOISE } from './noise';
import { FOG, OUTPUT, shared } from './shared';
import type { Quality } from './world';

export const MAX_RIPPLES = 16;

const HEIGHT = /* glsl */ `
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform vec4 uSlosh;
float waveH(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2(0.8, 0.6)) * 3.1 + t * 1.3) * 0.005;
  h += sin(dot(p, vec2(-0.5, 0.86)) * 4.7 + t * 1.9) * 0.0035;
  h += sin(dot(p, vec2(0.95, -0.3)) * 7.3 + t * 2.6) * 0.002;
  h += (lab_noise(vec3(p * 2.4, t * 0.4)) - 0.5) * 0.01;
  // Cat's paws: gusts ruffle patches of the surface as they cross the pond.
  h += (lab_noise(vec3(p * 7.0, t * 1.4)) - 0.5) * 0.007 * lab_gust(p, t);
  float sd = dot(p - uSlosh.yz, normalize(vec2(0.3, 1.0)));
  h += uSlosh.x * sin(sd * 2.6 - t * 4.2) * 0.5;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRipples[i];
    float age = t - r.z;
    if (age < 0.0 || age > 4.5 || r.w <= 0.0) continue;
    float d = length(p - r.xy);
    // A bigger disturbance makes longer waves that travel faster and reach further; a light
    // touch makes a small, quick-fading ring.
    float big = min(r.w, 2.2);
    float x = d - age * (0.78 + 0.16 * big);
    float env = exp(-x * x * 7.0 / (1.0 + 0.5 * big)) * exp(-age * (1.25 - 0.18 * big)) / (1.0 + d * 1.8);
    // Longer waves outrun shorter ones, so each ring spreads into a softer train as it ages.
    h += sin(x * (26.0 - min(age, 3.0) * 4.0) / (1.0 + 0.22 * big)) * env * r.w * 0.028;
  }
  return h;
}`;

export interface Water {
  /** Planar reflection texture and its projection, or null for the cheaper sky/bank tint. */
  setReflection(tex: THREE.Texture | null, mat?: THREE.Matrix4): void;
  mesh: THREE.Mesh;
  addRipple(x: number, z: number, strength?: number, delay?: number): void;
  slosh(x: number, z: number, amount: number): void;
  /** Surface height at (x, z) right now, for floating things. Approximate (no noise term). */
  heightAt(x: number, z: number): number;
  update(dt: number): void;
}

export function buildWater(quality: Quality): Water {
  const seg = quality === 'high' ? 140 : 90;
  const g = new THREE.PlaneGeometry(10, 9, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0.2);
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
  const slosh = new THREE.Vector4(0, 0, 0, 0);
  let next = 0;
  const uniforms = {
    ...shared,
    uRipples: { value: ripples },
    uSlosh: { value: slosh },
    uShallow: { value: new THREE.Color(0.1, 0.42, 0.4) },
    uBank: { value: new THREE.Color(0.16, 0.22, 0.12) },
    uRefl: { value: null as THREE.Texture | null },
    uReflMat: { value: new THREE.Matrix4() },
    uHasRefl: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime, uLevel;
      ${GLSL_NOISE}
      ${HEIGHT}
      varying vec3 vW;
      uniform mat4 uReflMat; varying vec4 vRefUv;
      void main(){
        vec3 p = position;
        p.y = uLevel + waveH(p.xz, uTime);
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz;
        vRefUv = uReflMat * vec4(w.xyz, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform float uTime, uLevel, uLush, uFogDensity;
      uniform vec3 uSunDir, uSunColor, uSky, uFogColor, uShallow, uBank;
      uniform sampler2D uRefr; uniform sampler2D uDepth; uniform sampler2D uRefl; uniform float uHasRefl;
      varying vec4 vRefUv;
      uniform vec2 uRes, uNearFar;
      varying vec3 vW;
      ${GLSL_NOISE}
      ${HEIGHT}
      ${FOG}
      float linDepth(float z){ return perspectiveDepthToViewZ(z, uNearFar.x, uNearFar.y) * -1.0; }
      void main(){
        vec2 p = vW.xz;
        float e = 0.025;
        float h0 = waveH(p, uTime);
        vec3 n = normalize(vec3(-(waveH(p + vec2(e, 0.0), uTime) - h0) / e, 1.0, -(waveH(p + vec2(0.0, e), uTime) - h0) / e));
        vec3 v = normalize(cameraPosition - vW);
        float ndv = max(dot(n, v), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

        vec2 suv = gl_FragCoord.xy / uRes;
        float fragZ = linDepth(gl_FragCoord.z);
        float thick = max(linDepth(texture2D(uDepth, suv).r) - fragZ, 0.0);
        vec2 ruv = suv + n.xz * 0.045 * clamp(thick * 1.4, 0.0, 1.0);
        float z2 = linDepth(texture2D(uDepth, ruv).r);
        if (z2 < fragZ) ruv = suv; else thick = z2 - fragZ;
        // Even shallow spring water tints what's under it slightly teal.
        vec3 refr = texture2D(uRefr, ruv).rgb * vec3(0.82, 0.96, 0.94);

        // Light lost on the way down and back: red first, then green.
        float path = thick * (0.6 + 0.6 * (1.0 - ndv));
        vec3 absorb = exp(-vec3(0.95, 0.32, 0.24) * path * 1.9);
        vec3 inscatter = uShallow * (0.55 + 0.45 * uLush) * mix(vec3(1.0), uSunColor, 0.4);
        vec3 col = refr * absorb + inscatter * (1.0 - absorb.g) * 0.85;

        vec3 r = reflect(-v, n);
        vec3 sky = mix(vec3(1.0, 0.93, 0.8), uSky, smoothstep(0.0, 0.7, r.y));
        float bankK = 1.0 - smoothstep(0.08, 0.5, r.y + 0.12 * (lab_noise(vec3(r.xz * 6.0, 1.0)) - 0.5));
        vec3 refl = mix(sky, uBank, bankK);
        if (uHasRefl > 0.5) {
          // The real reflection (Ripple, stones, ferns), bent by the waves.
          vec4 ru = vRefUv;
          ru.xy += n.xz * 0.05 * ru.w;
          refl = mix(refl, texture2DProj(uRefl, ru).rgb, 0.92);
        }
        col = mix(col, refl, clamp(fres * 0.95 + 0.06 * uHasRefl, 0.0, 1.0));

        vec3 sr = reflect(-uSunDir, n);
        float sun = pow(max(dot(sr, v), 0.0), 900.0) * 9.0 + pow(max(dot(sr, v), 0.0), 60.0) * 0.12;
        float glitter = step(0.988, lab_noise(vec3(p * 70.0, uTime * 3.0))) * pow(max(dot(sr, v), 0.0), 6.0) * 2.5;
        col += uSunColor * (sun + glitter) * (0.7 + 0.5 * uLush);

        // Ripple crests catch the light, so each ring reads as it travels.
        float crest = smoothstep(0.011, 0.024, h0);
        col += vec3(0.85, 0.97, 1.0) * crest * 0.22 * (0.4 + 0.6 * ndv);
        float foam = 1.0 - smoothstep(0.0, 0.025, thick);
        foam *= smoothstep(0.45, 0.75, lab_noise(vec3(p * 18.0, uTime * 0.6)) + lab_noise(vec3(p * 5.0, uTime * 0.2)) * 0.4);
        col = mix(col, vec3(0.92, 0.95, 0.92), foam * 0.4);

        // Fade out where the water meets stone so the edge isn't a hard line.
        float alpha = smoothstep(0.0, 0.035, thick);
        col = lab_fog(col, vW);
        gl_FragColor = vec4(col, alpha);
        ${OUTPUT}
      }`,
    transparent: true
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;

  return {
    mesh,
    setReflection(tex, mat) {
      uniforms.uRefl.value = tex;
      uniforms.uHasRefl.value = tex ? 1 : 0;
      // Keep a live reference: the scene updates this matrix every frame.
      if (mat) uniforms.uReflMat.value = mat;
    },
    addRipple(x, z, strength = 1, delay = 0) {
      ripples[next]!.set(x, z, shared.uTime.value + delay, strength);
      next = (next + 1) % MAX_RIPPLES;
    },
    slosh(x, z, amount) {
      slosh.set(Math.min(0.03, slosh.x + amount), x, z, 0);
    },
    heightAt(x, z) {
      const t = shared.uTime.value;
      let h = shared.uLevel.value;
      h += Math.sin((x * 0.8 + z * 0.6) * 3.1 + t * 1.3) * 0.005;
      const sd = (x - slosh.y) * 0.287 + (z - slosh.z) * 0.958;
      h += slosh.x * Math.sin(sd * 2.6 - t * 4.2) * 0.5;
      for (const r of ripples) {
        const age = t - r.z;
        if (age < 0 || age > 4.5 || r.w <= 0) continue;
        const d = Math.hypot(x - r.x, z - r.y);
        // Same wave as the shader (see waveH).
        const big = Math.min(r.w, 2.2);
        const xx = d - age * (0.78 + 0.16 * big);
        const env = (Math.exp((-xx * xx * 7) / (1 + 0.5 * big)) * Math.exp(-age * (1.25 - 0.18 * big))) / (1 + d * 1.8);
        h += Math.sin((xx * (26 - Math.min(age, 3) * 4)) / (1 + 0.22 * big)) * env * r.w * 0.028;
      }
      return h;
    },
    update(dt) {
      slosh.x *= Math.exp(-dt * 0.9);
    }
  };
}
