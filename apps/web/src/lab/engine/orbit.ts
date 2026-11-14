/**
 * Camera for exploring the hollow.
 *  - Drag (mouse, pen or one finger) to look around. The drag moves a *goal*; the camera eases
 *    toward it, so input is smooth at any frame rate. On release the view carries on with the
 *    finger's speed and slows to a stop (time-based, so the same on 30 and 120 Hz screens).
 *  - Natural angles only: the orbit has limits (the scene never shows its unfinished back or
 *    goes under the ground). Pushing past one meets growing resistance and springs back.
 *  - Pinch or scroll (or a trackpad pinch) to move closer, eased.
 *  - A short press without movement is a tap; a longer still press is a press (its length is
 *    reported, so the water can make a bigger ripple). Touch gets more slack than a mouse.
 *  - Only the canvas listens, so buttons over it never start a drag; a drag that ends over a
 *    button never clicks it (the pointer is captured by the canvas).
 * When nobody is touching it the camera drifts very slowly; on desktop it leans a little toward
 * the pointer for parallax. Both stop with reduced motion.
 */
import * as THREE from 'three';

export interface OrbitOptions {
  /**
   * A tap or a still press; `held` is how long it was held, in seconds, and `coarse` says it
   * came from a finger (less precise than a mouse).
   */
  onTap(ndc: THREE.Vector2, held: number, coarse: boolean): void;
  /** Once per gesture: the view was turned, or zoomed. */
  onDrag?(): void;
  onZoom?(): void;
  onHover?(ndc: THREE.Vector2 | null): void;
  /** Once per drag, when the person has clearly started looking around. */
  onExplore?(): void;
}

export class Orbit {
  target = new THREE.Vector3(0, 0.3, 0.5);
  az = 0.05;
  pol = 1.12;
  dist = 7;
  azLim: [number, number] = [-0.62, 0.62];
  polLim: [number, number] = [0.85, 1.42];
  distLim: [number, number] = [3.4, 9.5];
  reduced = false;
  /** Extra distance for portrait screens, so the scene still fits. */
  fit = 0;
  /** A host's framing: shifts where the camera looks (e.g. Ripple clear of text on Today). */
  frameOffset = new THREE.Vector3();
  frameDist = 0;
  /** Where the drag wants the view; az and pol ease toward these. */
  private azGoal = this.az;
  private polGoal = this.pol;
  /** Release speed, radians per second. */
  private vAz = 0;
  private vPol = 0;
  /** Recent drag samples, for the release speed. */
  private trail: { t: number; az: number; pol: number }[] = [];
  /** Set while a drag is past the tap threshold (so a tap never also turns the view). */
  dragging = false;
  /**
   * Locked (Today's stage): taps still reach the scene, but drags and the wheel are left to
   * the page, so swiping over the pond scrolls the screen instead of turning the view.
   */
  locked = false;
  private idle = 10;
  private pointers = new Map<
    number,
    { x: number; y: number; x0: number; y0: number; t0: number; touch: boolean; drag?: boolean; explored?: boolean }
  >();
  private pinch0 = 0;
  private dist0 = 0;
  private hover = new THREE.Vector2();
  private hoverOn = false;
  private lean = new THREE.Vector2();
  private time = 0;
  /** Zoom eases toward this instead of jumping. */
  private distGoal = this.dist;
  /** The opening move: eases from a wider, higher view into the framing. */
  private intro = 0;
  /** A short camera move the scene asks for (a pour, a celebration). */
  private shotOff = { az: 0, pol: 0, dist: 0, target: new THREE.Vector3() };
  private shotT = -1;
  private shotHold = 0;
  private shotW = 0;
  private readonly tmpTarget = new THREE.Vector3();

  constructor(
    private el: HTMLElement,
    private opts: OrbitOptions
  ) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('pointerleave', this.leave);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', this.noMenu);
  }

  private noMenu = (e: Event) => e.preventDefault();

  dispose() {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
    this.el.removeEventListener('pointerleave', this.leave);
    this.el.removeEventListener('wheel', this.wheel);
    this.el.removeEventListener('contextmenu', this.noMenu);
  }

  /** Beyond a limit, movement meets growing resistance (at most `give` past it). */
  private soft(v: number, [lo, hi]: [number, number], give: number) {
    if (v < lo) return lo - give * (1 - Math.exp(-(lo - v) / give));
    if (v > hi) return hi + give * (1 - Math.exp(-(v - hi) / give));
    return v;
  }

  private ndc(x: number, y: number): THREE.Vector2 {
    const r = this.el.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  /** Unclamped drag position, so the resistance at a limit is continuous. */
  private rawAz = 0;
  private rawPol = 0;

  private down = (e: PointerEvent) => {
    // Primary button only: right-click and middle-click don't turn the view.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.locked) {
      // Only watch for a tap; never capture, so the page keeps the gesture.
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), touch: e.pointerType !== 'mouse' });
      return;
    }
    // Capture can throw if the pointer is already gone (a cancelled touch); input still works.
    try {
      this.el.setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable: fine */
    }
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      touch: e.pointerType !== 'mouse'
    });
    // Grabbing stops any glide where it is.
    this.vAz = this.vPol = 0;
    this.azGoal = this.rawAz = this.az;
    this.polGoal = this.rawPol = this.pol;
    this.trail = [];
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.dist0 = this.distGoal;
    }
    this.idle = 0;
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (e.pointerType === 'mouse') {
      this.hover.copy(this.ndc(e.clientX, e.clientY));
      this.hoverOn = true;
      this.opts.onHover?.(this.hover);
    }
    if (!p) return;
    if (this.locked) {
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > (p.touch ? 12 : 6)) p.drag = true;
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (this.pinch0 > 0) this.distGoal = THREE.MathUtils.clamp((this.dist0 * this.pinch0) / d, ...this.distLim);
      if (![...this.pointers.values()].some((q) => q.drag)) this.opts.onZoom?.();
      for (const q of this.pointers.values()) q.drag = true;
      return;
    }
    const far = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
    if (!p.drag) {
      // Small wobbles while tapping don't turn the view.
      if (far < (p.touch ? 12 : 6)) return;
      p.drag = true;
      this.dragging = true;
      this.opts.onDrag?.();
    }
    if (!p.explored && far > 60) {
      p.explored = true;
      this.opts.onExplore?.();
    }
    const h = this.el.clientHeight || 600;
    this.rawAz += (-dx / h) * 2.2;
    this.rawPol += (-dy / h) * 1.6;
    this.azGoal = this.soft(this.rawAz, this.azLim, 0.1);
    this.polGoal = this.soft(this.rawPol, this.polLim, 0.06);
    const now = performance.now();
    this.trail.push({ t: now, az: this.azGoal, pol: this.polGoal });
    while (this.trail.length > 2 && now - this.trail[0]!.t > 100) this.trail.shift();
    this.idle = 0;
  };

  private up = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    const held = (performance.now() - p.t0) / 1000;
    if (!p.drag) {
      // Up to 1.2 s still counts: a longer press makes a bigger splash where it lands.
      if (held < 1.2 && this.pointers.size === 0) this.opts.onTap(this.ndc(e.clientX, e.clientY), held, p.touch);
    } else if (this.pointers.size === 0) {
      // Carry on with the finger's speed over its last ~100 ms (none if it stopped first).
      const tr = this.trail;
      const now = performance.now();
      if (tr.length >= 2 && now - tr[tr.length - 1]!.t < 60) {
        const a = tr[0]!;
        const b = tr[tr.length - 1]!;
        const span = Math.max(0.016, (b.t - a.t) / 1000);
        this.vAz = THREE.MathUtils.clamp((b.az - a.az) / span, -3, 3);
        this.vPol = THREE.MathUtils.clamp((b.pol - a.pol) / span, -2, 2);
      }
    }
    if (this.pointers.size === 0) this.dragging = false;
  };

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.dragging = false;
  };

  private leave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.hoverOn = false;
      this.opts.onHover?.(null);
    }
  };

  private wheel = (e: WheelEvent) => {
    if (this.locked) return;
    e.preventDefault();
    // Lines (Firefox) to pixels; a trackpad pinch arrives as a ctrl-wheel with small steps.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.distGoal = THREE.MathUtils.clamp(this.distGoal * Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0012)), ...this.distLim);
    this.opts.onZoom?.();
    this.idle = 0;
  };

  private isPortrait: boolean | null = null;
  /** Tall screens look down more steeply, so the pool fills the frame instead of the back slope. */
  portrait(on: boolean) {
    if (on === this.isPortrait) return;
    this.isPortrait = on;
    // Framed on Buddy, with the spout and the pool still in shot.
    if (on) {
      this.target.set(0.05, 0.98, 1.2);
      this.pol = this.polGoal = 1.1;
      this.dist = this.distGoal = 5.6;
      this.polLim = [0.75, 1.4];
    } else {
      this.target.set(0.15, 0.72, 0.9);
      this.pol = this.polGoal = 1.2;
      this.dist = this.distGoal = 5.4;
      this.polLim = [0.85, 1.45];
    }
  }

  /** Move the view, e.g. from the keyboard. */
  nudge(daz: number, dpol: number, zoom = 1) {
    // Eased like a drag (the keyboard's steps glide instead of jumping).
    this.vAz = this.vPol = 0;
    this.azGoal = THREE.MathUtils.clamp(this.azGoal + daz, ...this.azLim);
    this.polGoal = THREE.MathUtils.clamp(this.polGoal + dpol, ...this.polLim);
    this.distGoal = THREE.MathUtils.clamp(this.distGoal * zoom, ...this.distLim);
    this.idle = 0;
  }

  /**
   * A gentle, temporary camera move: blends in, holds, blends out. Offsets add to wherever
   * the person has put the camera, and any drag takes over immediately.
   */
  shot(o: { az?: number; pol?: number; dist?: number; target?: THREE.Vector3 }, hold: number) {
    if (this.reduced) return;
    this.shotOff.az = o.az ?? 0;
    this.shotOff.pol = o.pol ?? 0;
    this.shotOff.dist = o.dist ?? 0;
    this.shotOff.target.copy(o.target ?? new THREE.Vector3());
    this.shotT = 0;
    this.shotHold = hold;
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    this.time += dt;
    this.idle += dt;
    if (this.pointers.size === 0) {
      // Glide after release, then settle back inside the limits if a drag pushed past them.
      this.azGoal += this.vAz * dt;
      this.polGoal += this.vPol * dt;
      const decay = Math.exp(-dt * (this.reduced ? 12 : 5));
      this.vAz *= decay;
      this.vPol *= decay;
      for (const [k, lim] of [
        ['azGoal', this.azLim],
        ['polGoal', this.polLim]
      ] as const) {
        const v = this[k];
        const c = THREE.MathUtils.clamp(v, ...lim);
        if (v !== c) {
          this[k] = c + (v - c) * Math.exp(-dt * 9);
          if (k === 'azGoal') this.vAz = 0;
          else this.vPol = 0;
        }
      }
    }
    // The view eases toward the goal: quick enough to feel attached to the finger, never steppy.
    const follow = 1 - Math.exp(-dt * 16);
    this.az += (this.azGoal - this.az) * follow;
    this.pol += (this.polGoal - this.pol) * follow;
    // Zoom glides to where the wheel or pinch asked.
    this.dist += (this.distGoal - this.dist) * (1 - Math.exp(-dt * 7));
    let az = this.az;
    let pol = this.pol;
    let extraDist = 0;
    this.tmpTarget.copy(this.target);
    if (!this.reduced) {
      // Opening move: from wider and higher, easing out over about three seconds.
      if (this.intro < 1) {
        this.intro = Math.min(1, this.intro + dt / 3);
        const e = 1 - (1 - this.intro) ** 3;
        extraDist += (1 - e) * 1.8;
        pol -= (1 - e) * 0.14;
        az += (1 - e) * 0.18;
      }
      // Scene-requested shots, which give way the moment someone drags.
      if (this.shotT >= 0) {
        this.shotT += dt;
        const inW = THREE.MathUtils.smoothstep(this.shotT, 0, 0.9);
        const outW = 1 - THREE.MathUtils.smoothstep(this.shotT, this.shotHold, this.shotHold + 1.4);
        const want = this.pointers.size ? 0 : inW * outW;
        this.shotW += (want - this.shotW) * (1 - Math.exp(-dt * (this.pointers.size ? 10 : 4)));
        if (this.shotT > this.shotHold + 1.5) this.shotT = -1;
      } else this.shotW *= Math.exp(-dt * 4);
      az += this.shotOff.az * this.shotW;
      pol += this.shotOff.pol * this.shotW;
      extraDist += this.shotOff.dist * this.shotW;
      this.tmpTarget.addScaledVector(this.shotOff.target, this.shotW);
    } else this.intro = 1;
    if (!this.reduced) {
      const drift = THREE.MathUtils.smoothstep(this.idle, 4, 9);
      az += Math.sin(this.time * 0.07) * 0.12 * drift;
      pol += Math.sin(this.time * 0.05 + 1) * 0.03 * drift;
      const want = this.hoverOn ? this.hover : new THREE.Vector2();
      this.lean.lerp(want, 1 - Math.exp(-dt * 2));
      az -= this.lean.x * 0.05;
      pol += this.lean.y * 0.025;
    }
    const d = this.dist + this.fit + extraDist + this.frameDist;
    const tg = this.tmpTarget.add(this.frameOffset);
    camera.position.set(
      tg.x + d * Math.sin(pol) * Math.sin(az),
      tg.y + d * Math.cos(pol),
      tg.z + d * Math.sin(pol) * Math.cos(az)
    );
    camera.lookAt(tg);
  }
}
