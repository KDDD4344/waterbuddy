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
