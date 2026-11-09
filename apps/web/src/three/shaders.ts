import * as THREE from 'three';

/** Appended to every custom fragment shader so tone mapping and sRGB output match three's own materials. */
export const OUTPUT = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

export const WORLD_VS = `
varying vec3 vN; varying vec3 vW; varying vec3 vV; varying vec2 vUv;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Stylised glass: fresnel rim, a sharp highlight and one streak. Cheaper and more controllable than transmission. */
export function glassMaterial({ tint = 0xd5f4ee, opacity = 0.08, side = THREE.FrontSide as THREE.Side } = {}) {
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
        ${OUTPUT}
      }`,
    transparent: true,
    depthWrite: false,
    side
  });
}

export type LiquidUniforms = {
  uFill: { value: number };
  uWob: { value: THREE.Vector2 };
  uCenter: { value: THREE.Vector3 };
  uTime: { value: number };
  uRipple: { value: number };
  uRipplePos: { value: THREE.Vector2 };
  uDeep: { value: THREE.Color };
  uShallow: { value: THREE.Color };
  uSurf: { value: THREE.Color };
  uLight: { value: THREE.Vector3 };
  uOn: { value: number };
};

/**
 * Liquid in a container: fragments above a world-space fill plane are discarded; the plane
 * tilts with a spring-driven wobble and carries ripples. Faces turned away from the camera
 * are drawn as the surface cap seen through the cut. Rendered as two meshes (back faces,
 * then front faces) so ordering is stable.
 */
export function liquidMaterial(uniforms?: LiquidUniforms, side: THREE.Side = THREE.FrontSide) {
  const u: LiquidUniforms = uniforms ?? {
    uFill: { value: 0 },
    uWob: { value: new THREE.Vector2() },
    uCenter: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uRipple: { value: 0 },
    uRipplePos: { value: new THREE.Vector2() },
    uDeep: { value: new THREE.Color(0x0d5866) },
    uShallow: { value: new THREE.Color(0x4fc0b2) },
    uSurf: { value: new THREE.Color(0xc4f2ea) },
    uLight: { value: new THREE.Vector3(0.45, 0.85, 0.5).normalize() },
    uOn: { value: 1 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
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
          c += pow(max(dot(n, normalize(uLight + vV)), 0.0), 70.0) * 0.7;
          c = mix(c, uSurf, smoothstep(0.035, 0.0, h - vW.y) * 0.8);
          gl_FragColor = vec4(c, 0.9);
        } else {
          float s = 0.5 + 0.5 * sin(vW.x * 22.0 + uTime * 3.0) * sin(vW.z * 19.0 - uTime * 2.4);
          float ring = uRipple * 0.5 * (0.5 + 0.5 * sin(rd * 26.0 - uTime * 12.0)) * exp(-rd * 2.0);
          gl_FragColor = vec4(mix(uShallow, uSurf, 0.5 + 0.3 * s + ring), 0.95);
        }
        ${OUTPUT}
      }`,
    transparent: true,
    depthWrite: false,
    side
  });
  return { material: mat, uniforms: u };
}
