/**
 * Uniforms shared by every custom material in the lab. Materials hold references to these
 * objects, so the scene updates time, light, water level and "lushness" once per frame.
 */
import * as THREE from 'three';

// Late-morning sun from behind the spring, a little to the left: backlit leaves, long shadows toward us.
export const SUN_DIR = new THREE.Vector3(-0.3, 0.75, -0.6).normalize();

/** A colour written the way designers pick them (sRGB 0..1), converted to three's linear space. */
export const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR },
  uSunColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
  uSky: { value: new THREE.Color(0.58, 0.78, 0.82) },
  uFogColor: { value: new THREE.Color().setRGB(0.6, 0.68, 0.56, THREE.SRGBColorSpace) },
  uFogDensity: { value: 0.028 },
  /** Water surface height in world space. */
  uLevel: { value: 0 },
  /** 0..1: how hydrated the spring is (today's progress). Plants, light and colour follow it. */
  uLush: { value: 0 },
  uRefr: { value: null as THREE.Texture | null },
  uDepth: { value: null as THREE.Texture | null },
  uRes: { value: new THREE.Vector2(1, 1) },
  uNearFar: { value: new THREE.Vector2(0.1, 80) }
};

export const OUTPUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

/** Exponential fog matching scene.fog, for custom shaders. Needs vW (world position). */
export const FOG = /* glsl */ `
vec3 lab_fog(vec3 col, vec3 w){
  float d = length(w - cameraPosition);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}`;
