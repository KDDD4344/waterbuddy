/**
 * Optional sound, off by default. Everything is synthesised (no audio files). The pour is
 * filtered noise whose pitch rises as the bottle fills, like a real bottle under a tap.
 */
export interface Sound {
  enabled: boolean;
  pour(seconds: number, fromFill: number, toFill: number): void;
  tone(freq: number, seconds?: number, type?: OscillatorType, volume?: number): void;
  chord(base: number): void;
}

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  const get = (enabled: boolean): AudioContext | null => {
    if (!enabled || typeof window === 'undefined') return null;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = ctx ?? new Ctor();
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };
  const s: Sound = {
    enabled: false,
    pour(seconds, fromFill, toFill) {
      const c = get(s.enabled);
      if (!c) return;
      const len = Math.floor(c.sampleRate * seconds);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 9;
      const t = c.currentTime;
      bp.frequency.setValueAtTime(380 + fromFill * 900, t);
      bp.frequency.exponentialRampToValueAtTime(380 + toFill * 900, t + seconds);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.45, t + 0.06);
      g.gain.setValueAtTime(0.45, t + Math.max(0.07, seconds - 0.15));
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      src.connect(bp).connect(g).connect(c.destination);
      src.start(t);
      src.stop(t + seconds);
    },
    tone(freq, seconds = 0.45, type = 'sine', volume = 0.16) {
      const c = get(s.enabled);
      if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volume, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + seconds + 0.05);
    },
    chord(base) {
      [1, 1.25, 1.5].forEach((m, i) => window.setTimeout(() => s.tone(base * m, 0.7), i * 90));
    }
  };
  return s;
}
