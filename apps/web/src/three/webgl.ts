let cached: boolean | null = null;

/** Whether this device can draw the 3D tidepool at all. Checked once. */
export function canUseWebGL(): boolean {
  if (cached !== null) return cached;
  try {
    if (typeof document === 'undefined') return (cached = false);
    const c = document.createElement('canvas');
    cached = !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}

let software: boolean | null = null;

/**
 * True when WebGL is drawn on the CPU (SwiftShader, llvmpipe, Microsoft's basic renderer):
 * no graphics chip is helping, so a live 3D scene would run at a few frames a second and
 * make the whole app sluggish. The still picture of the spring is used instead.
 */
export function softwareRenderer(): boolean {
  if (software !== null) return software;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) ?? gl?.getParameter(gl.RENDERER) ?? '');
    software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    software = false;
  }
  return software;
}

const FORCE_KEY = 'wb-3d-anyway';

/** Someone chose to see the live spring even on a software renderer (or a test asked with ?3d=on). */
export function live3dForced(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('3d') === 'on') return true;
    return localStorage.getItem(FORCE_KEY) === '1';
  } catch {
    return false;
  }
}

export function forceLive3d() {
  try {
    localStorage.setItem(FORCE_KEY, '1');
  } catch {
    // Private mode: it just won't be remembered.
  }
}

/** Whether to run the live 3D scene here: WebGL exists, and a graphics chip draws it (or it was asked for). */
export function canRunLive3d(): boolean {
  return canUseWebGL() && (!softwareRenderer() || live3dForced());
}
