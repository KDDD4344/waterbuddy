export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Frame-rate independent exponential smoothing toward `b`. */
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** 0 → 1 → 0 over [0, 1]. */
export const bump = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Damped spring, sub-stepped so it stays stable at low frame rates. */
export class Spring {
  v: number;
  target: number;
  vel = 0;
  constructor(
    v = 0,
    public k = 60,
    public d = 9
  ) {
    this.v = v;
    this.target = v;
  }
  step(dt: number): number {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const f = -this.k * (this.v - this.target) - this.d * this.vel;
      this.vel += f * h;
      this.v += this.vel * h;
    }
    return this.v;
  }
  snap(v: number) {
    this.v = v;
    this.target = v;
    this.vel = 0;
  }
}
