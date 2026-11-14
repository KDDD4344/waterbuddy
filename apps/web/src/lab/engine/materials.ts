/**
 * Adds the spring's shared lighting to three's own physically based materials, so rocks,
 * plants and pebbles keep proper shadows and environment light and also get:
 *  - caustics on anything below the water line, fading with depth,
 *  - a dark wet band just above the water line that moves as the level rises,
 *  - dappled light through the canopy,
 *  - glow through backlit leaves,
 *  - wind sway for plants (instanced or not) and a "rustle" when touched,
 *  - greener, livelier plants as the day's drinking goes on.
 */
import * as THREE from 'three';
import { GLSL_NOISE } from './noise';
import { shared } from './shared';

export interface EnvOptions {
  caustics?: boolean;
  wet?: boolean;
  dapple?: number;
  translucent?: number;
  sway?: { amount: number; height: number; sign?: number };
  lush?: number;
  /** Procedural bump: grain on stone and sand, in world space. */
  bump?: { amount: number; freq: number };
}

export interface EnvHandles {
  uRustle: { value: THREE.Vector3 };
  uSway: { value: number };
}

export function withEnv<T extends THREE.MeshStandardMaterial>(mat: T, o: EnvOptions): T & { env: EnvHandles } {
  const own = {
    uCaustics: { value: o.caustics ? 1 : 0 },
    uWet: { value: o.wet ? 1 : 0 },
    uDapple: { value: o.dapple ?? 0 },
    uTranslucent: { value: o.translucent ?? 0 },
    uSway: { value: o.sway?.amount ?? 0 },
    uSwayHeight: { value: o.sway?.height ?? 1 },
    uSwaySign: { value: o.sway?.sign ?? 1 },
    uLushAmt: { value: o.lush ?? 0 },
    uRustle: { value: new THREE.Vector3(999, 999, 0) },
    uBump: { value: o.bump?.amount ?? 0 },
    uBumpFreq: { value: o.bump?.freq ?? 1 }
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, own, {
      uTime: shared.uTime,
      uLevel: shared.uLevel,
      uLush: shared.uLush,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor
    });
    const decl = `
      uniform float uTime, uLevel, uLush, uCaustics, uWet, uDapple, uTranslucent, uSway, uSwayHeight, uSwaySign, uLushAmt, uBump, uBumpFreq;
      uniform vec3 uSunDir, uSunColor, uRustle;
      varying vec3 vLabW;`;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${decl}\n${GLSL_NOISE}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (uSway > 0.0) {
          vec4 lab_ip = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            lab_ip = instanceMatrix * lab_ip;
          #endif
          lab_ip = modelMatrix * lab_ip;
          float lab_h = clamp(position.y * uSwaySign / uSwayHeight, 0.0, 1.0);
          lab_h *= lab_h;
          float lab_ph = lab_ip.x * 0.7 + lab_ip.z * 0.5;
          float lab_s = (sin(uTime * 1.5 + lab_ph) * 0.6 + sin(uTime * 2.6 + lab_ph * 1.7) * 0.3 + sin(uTime * 5.3 + lab_ph * 3.1) * 0.1) * uSway * lab_h;
          // Gusts roll through: plants sway harder as a gust passes, calmer between.
          lab_s *= 0.55 + 0.9 * lab_gust(lab_ip.xz, uTime);
          float lab_d = distance(lab_ip.xz, uRustle.xy);
          lab_s += sin(uTime * 19.0 + lab_ph) * uRustle.z * exp(-lab_d * lab_d * 1.2) * lab_h * 0.25;
          transformed.x += lab_s;
          transformed.z += lab_s * 0.6;
        }`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 lab_lp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            lab_lp = instanceMatrix * lab_lp;
          #endif
          vLabW = (modelMatrix * lab_lp).xyz;
        }`
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${decl}\n${GLSL_NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float lab_g = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
          float lab_k = clamp(lab_g * 8.0, 0.0, 1.0) * uLushAmt;
          vec3 lab_dry = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))), diffuseColor.rgb, 0.6) * vec3(1.05, 1.0, 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(lab_dry, diffuseColor.rgb * vec3(0.92, 1.1, 0.88), uLush), lab_k);
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uBump > 0.0) {
          float lab_bh = lab_fbm(vLabW * uBumpFreq) + 0.35 * lab_noise(vLabW * uBumpFreq * 5.0);
          vec2 lab_dh = vec2(dFdx(lab_bh), dFdy(lab_bh)) * uBump;
          vec3 lab_sp = -vViewPosition;
          vec3 lab_sx = normalize(dFdx(lab_sp));
          vec3 lab_sy = normalize(dFdy(lab_sp));
          vec3 lab_r1 = cross(lab_sy, normal);
          vec3 lab_r2 = cross(normal, lab_sx);
          float lab_det = dot(lab_sx, lab_r1) * faceDirection;
          vec3 lab_grad = sign(lab_det) * (lab_dh.x * lab_r1 + lab_dh.y * lab_r2);
          normal = normalize(abs(lab_det) * normal - lab_grad);
        }`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          float lab_under = smoothstep(uLevel + 0.015, uLevel - 0.06, vLabW.y);
          if (uCaustics > 0.5) {
            float lab_depth = max(0.0, uLevel - vLabW.y);
            float lab_c = lab_caustic(vLabW.xz * 1.7 + vec2(uTime * 0.04, 0.0), uTime * 0.55);
            lab_c += 0.5 * lab_caustic(vLabW.xz * 3.1 - 7.0, uTime * 0.7);
            outgoingLight += diffuseColor.rgb * uSunColor * lab_c * lab_under * 0.5 * exp(-lab_depth * 0.8);
          }
          if (uWet > 0.5) {
            float lab_wet = smoothstep(uLevel + 0.3, uLevel + 0.02, vLabW.y) * (1.0 - lab_under);
            outgoingLight *= 1.0 - 0.32 * lab_wet;
          }
          if (uDapple > 0.0) {
            vec2 lab_dp = vLabW.xz - vLabW.y * uSunDir.xz / max(uSunDir.y, 0.2);
            float lab_dap = smoothstep(0.38, 0.7, lab_fbm(vec3(lab_dp * 0.55, uTime * 0.04)));
            outgoingLight *= mix(1.0, mix(0.7, 1.15, lab_dap), uDapple * (1.0 - lab_under));
            // High cloud drifting over the hollow: a very slow, wide swell in the light.
            float lab_cloud = smoothstep(0.3, 0.7, lab_noise(vec3(lab_dp * 0.06 + vec2(uTime * 0.01, 0.0), uTime * 0.005)));
            outgoingLight *= mix(1.0, 0.9 + 0.12 * lab_cloud, uDapple);
          }
          if (uTranslucent > 0.0) {
            vec3 lab_v = normalize(cameraPosition - vLabW);
            float lab_b = pow(clamp(dot(lab_v, -uSunDir), 0.0, 1.0), 2.0);
            outgoingLight += diffuseColor.rgb * uSunColor * lab_b * uTranslucent * (0.8 + 0.4 * uLush);
          }
        }
        #include <opaque_fragment>`
      );
  };
  // Distinct programs per option set.
  mat.customProgramCacheKey = () => JSON.stringify(o);
  return Object.assign(mat, { env: { uRustle: own.uRustle, uSway: own.uSway } });
}
