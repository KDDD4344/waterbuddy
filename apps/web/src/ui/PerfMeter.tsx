import { useEffect, useRef, useState } from 'react';
import { summarise, type PerfStats } from '../lib/perf';

/** The meter shown with ?perf (Phase 8). See lib/perf.ts. */
function gpuName(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return 'unknown';
  }
}

export function PerfMeter() {
  const [stats, setStats] = useState<PerfStats>({ fps: 0, p95: 0, worst: 0 });
  const [copied, setCopied] = useState(false);
  const gpu = useRef<string>('');

  useEffect(() => {
    gpu.current = gpuName();
    const frames: number[] = [];
    let last = performance.now();
    let raf = 0;
    let shown = last;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      // Ignore gaps from a hidden tab.
      if (dt < 1000) frames.push(dt);
      if (frames.length > 300) frames.shift();
      if (t - shown > 500) {
        shown = t;
        setStats(summarise(frames));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const report = () =>
    [
      `fps ${stats.fps}`,
      `p95 ${stats.p95} ms`,
      `worst ${stats.worst} ms`,
      `screen ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
      `gpu ${gpu.current}`,
      `ua ${navigator.userAgent}`
    ].join('\n');

  return (
    <aside className="perf-meter" aria-label="Performance meter">
      <span>{stats.fps} fps</span>
      <span>p95 {stats.p95} ms</span>
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          void navigator.clipboard?.writeText(report()).then(() => setCopied(true));
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </aside>
  );
}
