/**
 * Procedural character animation shared by all three Buddy concepts.
 *
 * The animator knows nothing about meshes. It turns "idle + the current reaction" into a
 * Pose: a dozen named channels (hop, squash, lean, smile, blink ...). Each character maps
 * the same channels onto its own body, scaled by its Temperament, so a reaction reads as the
 * same emotion on a jelly, a stone and a cloud while each moves in its own way.
 *
 * Pure and deterministic given a seed, so it is unit-tested.
 */
import { mulberry32 } from './noise';

export type Reaction = 'happy' | 'curious' | 'celebrate' | 'nod';

export interface Temperament {
  /** How high and squashy hops are. 1 = Bloop's jelly, 0.45 = Cobble's stone. */
  bounce: number;
  /** Speed of everything. Below 1 is slow and heavy. */
  tempo: number;
  /** 0 = stands on the ground, 1 = hovers and bobs (Nimbus). */
  float: number;
}

export interface Pose {
  hop: number;
  /** + stretches tall, − squashes flat. Volume is kept by the character. */
  squash: number;
  /** Sideways roll and forward pitch, radians. */
  leanX: number;
  leanZ: number;
  spin: number;
  /** Head tilt, radians (the "huh?" tilt). */
  tilt: number;
  blink: number;
  /** Happy closed-eye arcs (^ ^). */
  squint: number;
  wide: number;
  smile: number;
  open: number;
  /** Round "o" mouth. */
  round: number;
  arms: number;
  wave: number;
  /** Each character's signature flourish: Bloop's core glow, Cobble's sprout, Nimbus's rainbow. */
  accent: number;
  breathe: number;
  /** Secondary-motion energy for wobble and jiggle. */
  jiggle: number;
}

export type AnimEvent = 'apex' | 'land' | 'end';

const CHANNELS: (keyof Pose)[] = [
  'hop',
  'squash',
  'leanX',
  'leanZ',
  'spin',
  'tilt',
  'blink',
  'squint',
  'wide',
  'smile',
  'open',
  'round',
  'arms',
  'wave',
  'accent',
  'breathe',
  'jiggle'
];

export function restPose(): Pose {
  return {
    hop: 0,
    squash: 0,
    leanX: 0,
    leanZ: 0,
    spin: 0,
    tilt: 0,
    blink: 0,
    squint: 0,
    wide: 0,
    smile: 0.35,
    open: 0,
    round: 0,
    arms: 0,
    wave: 0,
    accent: 0,
    breathe: 0,
    jiggle: 0
  };
}

/** Base length of each reaction in seconds, before tempo. */
export const DURATION: Record<Reaction, number> = { happy: 1.6, curious: 2.4, celebrate: 3.2, nod: 1.3 };

const bell = (u: number, c: number, w: number) => Math.exp(-(((u - c) / w) ** 2));
const win = (u: number, a: number, b: number) => (u < a || u > b ? -1 : (u - a) / (b - a));
const sstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);

/** Raw reaction pose at normalised time u (0..1). `side` is −1/1: which way to lean. */
export function reactionPose(kind: Reaction, u: number, t: number, tm: Temperament, side: number): Partial<Pose> {
  const b = tm.bounce;
  switch (kind) {
    case 'happy': {
      let hop = 0;
      let squash = 0;
      for (const [a, z] of [
        [0.1, 0.38],
        [0.44, 0.72]
      ] as const) {
        const v = win(u, a, z);
        if (v >= 0) {
          hop += 0.17 * b * Math.sin(Math.PI * v) ** (tm.float > 0.5 ? 0.7 : 1);
          squash += 0.12 * b * Math.sin(Math.PI * v);
        }
        squash -= 0.22 * b * (bell(u, a - 0.02, 0.035) + bell(u, z + 0.01, 0.04));
      }
      return {
        hop,
        squash,
        leanX: 0.1 * Math.sin(u * Math.PI * 4),
        smile: 1,
        open: 0.5,
        squint: sstep(0.04, 0.14, u) * (1 - sstep(0.86, 1, u)),
        arms: 0.7,
        wave: Math.sin(t * 15) * 0.8,
        jiggle: bell(u, 0.39, 0.05) + bell(u, 0.73, 0.05)
      };
    }
    case 'curious': {
      return {
        hop: 0.03 * sstep(0, 0.2, u) * (1 - sstep(0.8, 1, u)),
        squash:
          0.07 * sstep(0, 0.2, u) * (1 - sstep(0.8, 1, u)) + 0.035 * Math.sin(u * Math.PI * 8) * sstep(0.5, 0.6, u),
        leanZ: 0.13,
        leanX: 0.05 * side,
        tilt: 0.3 * side,
        wide: 0.85,
        smile: 0.05,
        open: 0.24,
        round: 1,
        arms: 0.15,
        blink: Math.max(bell(u, 0.52, 0.025), bell(u, 0.6, 0.025))
      };
    }
    case 'celebrate': {
      const crouch = bell(u, 0.13, 0.05);
      const v = win(u, 0.16, 0.56);
      const air = v >= 0 ? Math.sin(Math.PI * v) : 0;
      const after = sstep(0.56, 0.6, u);
      return {
        hop: 0.55 * b * (tm.float > 0.5 ? air ** 0.6 : air),
        squash:
          -0.34 * b * crouch +
          0.26 * b * (v >= 0 ? Math.sin(Math.PI * Math.min(1, v * 2)) : 0) -
          0.3 * b * bell(u, 0.57, 0.035),
        spin: v >= 0 ? Math.PI * 2 * easeInOut(v) : u > 0.56 ? Math.PI * 2 : 0,
        leanX: 0.16 * Math.sin(u * 34) * after * (1 - u),
        smile: 1,
        open: 0.15 + 0.7 * sstep(0.1, 0.2, u),
        squint: sstep(0.32, 0.4, u),
        wide: 0.6 * (1 - sstep(0.3, 0.4, u)),
        arms: 1,
        wave: Math.sin(t * 13) * 0.9 * after,
        accent: sstep(0.28, 0.42, u) * (1 - sstep(0.86, 1, u)),
        jiggle: bell(u, 0.58, 0.06) + 0.5 * crouch
      };
    }
    case 'nod': {
      return {
        leanZ: 0.16 * Math.sin(u * Math.PI * 2) * (1 - u),
        squash: -0.05 * Math.sin(u * Math.PI * 2),
        smile: 0.7,
        squint: 0.45 * Math.sin(Math.PI * u)
      };
    }
  }
}

export class Animator {
  private current: { kind: Reaction; t: number; dur: number; side: number } | null = null;
  private time = 0;
  private nextBlink: number;
  private blinkT = -1;
  private doubleBlink = false;
  private rand: () => number;
  private out: Pose = restPose();
  private squashVel = 0;
  private events: AnimEvent[] = [];
  private firedApex = false;
  private firedLand = false;

  constructor(
    public temperament: Temperament,
    public reduced = false,
    seed = 7
  ) {
    this.rand = mulberry32(seed);
    this.nextBlink = 1.2 + this.rand() * 2;
  }

  get playing(): Reaction | null {
    return this.current?.kind ?? null;
  }

  trigger(kind: Reaction, side = 1) {
    this.current = { kind, t: 0, dur: DURATION[kind] / this.temperament.tempo, side: side < 0 ? -1 : 1 };
    this.firedApex = false;
    this.firedLand = false;
    // People blink as their expression changes; it hides the switch and reads as a thought.
    if (this.blinkT < 0) {
      this.blinkT = 0;
      this.doubleBlink = false;
    }
  }

  /** Events since the last call: apex of a jump (sparkles), landing (ripples), end of a reaction. */
  drainEvents(): AnimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  update(dt: number): Pose {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const tm = this.temperament;
    const t = this.time;
    const raw = restPose();

    // Idle: breathing, a slow sway, hovering for floaters, blinking on a random rhythm.
    raw.breathe = Math.sin(t * 1.7 * tm.tempo);
    raw.squash = 0.028 * raw.breathe * (0.6 + tm.bounce * 0.4);
    raw.leanX = 0.035 * Math.sin(t * 0.73 * tm.tempo);
    raw.hop = tm.float * (0.07 * Math.sin(t * 1.2) + 0.025 * Math.sin(t * 2.9));
    raw.smile = 0.35;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.doubleBlink = this.rand() < 0.25;
      this.nextBlink = 2 + this.rand() * 3.5;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const p = this.blinkT;
      const one = (a: number) => (p >= a && p <= a + 0.16 ? Math.sin((Math.PI * (p - a)) / 0.16) : 0);
      raw.blink = Math.max(one(0), this.doubleBlink ? one(0.26) : 0);
      if (p > (this.doubleBlink ? 0.42 : 0.16)) this.blinkT = -1;
    }

    // Reaction on top of idle.
    if (this.current) {
      const c = this.current;
      c.t += dt;
      const u = Math.min(1, c.t / c.dur);
      const r = reactionPose(c.kind, u, t, tm, c.side);
      const e = sstep(0, 0.08, u) * (1 - sstep(0.9, 1, u));
      for (const k of CHANNELS) {
        const v = r[k];
        if (v === undefined) continue;
        if (k === 'hop' || k === 'squash' || k === 'spin' || k === 'jiggle' || k === 'leanX' || k === 'leanZ')
          raw[k] += v;
        else if (k === 'blink') raw.blink = Math.max(raw.blink, v);
        else raw[k] = raw[k] + (v - raw[k]) * e;
      }
      if (c.kind === 'celebrate') {
        if (!this.firedApex && u >= 0.36) {
          this.firedApex = true;
          this.events.push('apex');
        }
        if (!this.firedLand && u >= 0.56) {
          this.firedLand = true;
          this.events.push('land');
        }
      }
      if (c.t >= c.dur) {
        this.current = null;
        this.events.push('end');
      }
    }

    if (this.reduced) {
      raw.hop = 0;
      raw.spin = 0;
      raw.squash *= 0.25;
      raw.leanX *= 0.5;
      raw.leanZ *= 0.5;
      raw.wave *= 0.3;
      raw.jiggle *= 0.3;
    }

    // Smooth every channel so a new reaction never snaps; spin and blink stay crisp.
    const o = this.out;
    const k = 1 - Math.exp(-dt * 22);
    for (const ch of CHANNELS) {
      if (ch === 'squash') continue;
      if (ch === 'spin' || ch === 'blink' || ch === 'wave') o[ch] = raw[ch];
      else o[ch] += (raw[ch] - o[ch]) * k;
    }
    // Squash goes through an underdamped spring: the overshoot is what makes it feel soft.
    const stiff = 210 * tm.tempo;
    const damp = 2 * 0.32 * Math.sqrt(stiff) * (1.6 - tm.bounce * 0.6);
    this.squashVel += ((raw.squash - o.squash) * stiff - this.squashVel * damp) * dt;
    o.squash += this.squashVel * dt;
    if (this.current?.kind === 'celebrate' && this.current.t >= this.current.dur * 0.999) o.spin = 0;
    if (!this.current) o.spin = 0;
    return o;
  }
}
