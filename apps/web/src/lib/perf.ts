/**
 * Real-phone performance check (Phase 8). Open the app with ?perf at the end of the address
 * and a small meter shows frames per second, the slowest recent frame and the graphics chip.
 * Pilot testers copy the numbers into the feedback form. Nothing is sent anywhere.
 */
export function perfRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).has('perf')) sessionStorage.setItem('wb-perf', '1');
    return sessionStorage.getItem('wb-perf') === '1';
  } catch {
    return false;
  }
}

export interface PerfStats {
  fps: number;
  /** 95th-percentile frame time over the window, in ms. */
  p95: number;
  worst: number;
}

/** Summary of recent frame times (ms). */
export function summarise(frames: number[]): PerfStats {
  if (!frames.length) return { fps: 0, p95: 0, worst: 0 };
  const total = frames.reduce((a, b) => a + b, 0);
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  return {
    fps: Math.round((frames.length * 1000) / total),
    p95: Math.round(p95),
    worst: Math.round(sorted[sorted.length - 1]!)
  };
}
