/**
 * The lab's sound, synthesised with Web Audio (no audio files). Off until the person turns
 * Sound on in settings, which is also the user gesture browsers need to start audio.
 *
 *  - a soft brook ambience under everything,
 *  - the pour: flowing water whose pitch rises as the spring fills, with a gurgle,
 *  - a splash on impact and plinks for drips and bubbles,
 *  - a bell chime when a glass lands, one note higher for each glass toward the goal,
 *  - a short arpeggio for the glass that reaches the goal (the only celebration),
 *  - after the goal, a neutral soft tick: logging is acknowledged, never rewarded.
 */

// A major pentatonic run, so successive glasses always sound good together.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const BASE_HZ = 392; // G4

export interface LabSound {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  pour(seconds: number, fromFill: number, toFill: number): void;
  splash(strength?: number): void;
  plink(pitch?: number, volume?: number): void;
  chime(step: number): void;
  celebrate(): void;
  tick(): void;
  dispose(): void;
}

export function createLabSound(): LabSound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  let enabled = false;

  const get = (): AudioContext | null => {
    if (!enabled || typeof window === 'undefined') return null;
    try {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      if (!ctx) {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };

  const noise = (c: AudioContext, seconds: number, pink = false): AudioBuffer => {
    const len = Math.max(1, Math.floor(c.sampleRate * seconds));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // A one-pole low-pass on white noise is close enough to pink for water.
      b = pink ? 0.97 * b + 0.03 * w * 6 : w;
      d[i] = b;
    }
    return buf;
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, release: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  };

  const startAmbience = () => {
    const c = get();
    if (!c || !master || ambience) return;
    const src = c.createBufferSource();
    src.buffer = noise(c, 4, true);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.05, c.currentTime + 1.5);
    // A slow swell, like a brook nearby.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    src.connect(lp).connect(gain).connect(master);
    src.start();
    ambience = { src, gain };
  };

  const stopAmbience = () => {
    if (!ambience || !ctx) return;
    const a = ambience;
    ambience = null;
    a.gain.gain.cancelScheduledValues(ctx.currentTime);
    a.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    window.setTimeout(() => a.src.stop(), 1500);
  };

  const s: LabSound = {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      if (on) startAmbience();
      else stopAmbience();
    },
    pour(seconds, fromFill, toFill) {
      const c = get();
      if (!c || !master) return;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noise(c, seconds + 0.3);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.setValueAtTime(420 + fromFill * 700, t);
      bp.frequency.exponentialRampToValueAtTime(420 + toFill * 700 + 120, t + seconds);
      // Gurgle: the stream's pitch wobbles a few times a second.
      const lfo = c.createOscillator();
      lfo.frequency.value = 7;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 70;
      lfo.connect(lfoGain).connect(bp.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.12);
      g.gain.setValueAtTime(0.32, t + seconds - 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.2);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      lfo.start(t);
      src.stop(t + seconds + 0.3);
      lfo.stop(t + seconds + 0.3);
    },
    splash(strength = 1) {
      const c = get();
      if (!c || !master) return;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noise(c, 0.5);
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5000, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + 0.35);
      const g = c.createGain();
      env(g, t, 0.25 * strength, 0.008, 0.35);
      src.connect(hp).connect(lp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.5);
      for (let i = 0; i < 3; i++) s.plink(0.8 + Math.random() * 0.6, 0.05 * strength);
    },
    plink(pitch = 1, volume = 0.07) {
      const c = get();
      if (!c || !master) return;
      const t = c.currentTime + Math.random() * 0.08;
      const o = c.createOscillator();
      o.type = 'sine';
      // A water drop: a quick upward chirp as the bubble collapses.
      o.frequency.setValueAtTime(700 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(1500 * pitch, t + 0.05);
      const g = c.createGain();
      env(g, t, volume, 0.004, 0.12);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.2);
    },
    chime(step) {
      const c = get();
      if (!c || !master) return;
      const t = c.currentTime;
      const semis = SCALE[Math.max(0, Math.min(SCALE.length - 1, step))]!;
      const f = BASE_HZ * Math.pow(2, semis / 12);
      // A soft bell: the fundamental plus an inharmonic partial, decaying at different rates.
      for (const [mul, vol, len] of [
        [1, 0.12, 1.6],
        [2.76, 0.035, 0.7],
        [5.4, 0.012, 0.35]
      ] as const) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const g = c.createGain();
        env(g, t, vol, 0.006, len);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + len + 0.1);
      }
    },
    celebrate() {
      [4, 6, 7, 9].forEach((step, i) => window.setTimeout(() => s.chime(step), i * 110));
    },
    tick() {
      const c = get();
      if (!c || !master) return;
      const t = c.currentTime;
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 520;
      const g = c.createGain();
      env(g, t, 0.05, 0.004, 0.09);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.15);
    },
    dispose() {
      stopAmbience();
      void ctx?.close();
      ctx = null;
    }
  };
  return s;
}
