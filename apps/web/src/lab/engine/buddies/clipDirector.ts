/**
 * Plays the GLB's own animation clips (idle, happy, curious, celebrate) through three's
 * AnimationMixer with smooth transitions:
 *  - idle loops forever and never stops ticking, so returning to it never pops,
 *  - a reaction cross-fades in over idle, plays once, and cross-fades back out just before
 *    its last frame (it never freezes on a held pose),
 *  - asking for the reaction that's already playing doesn't restart it,
 *  - a lower-priority reaction never interrupts a higher one (curious can't cut into a
 *    celebration); an equal or higher one cross-fades from wherever the current one is.
 */
import * as THREE from 'three';

export type ClipName = 'idle' | 'happy' | 'curious' | 'celebrate';
export const REACTIONS = ['happy', 'curious', 'celebrate'] as const;
export type ReactionClip = (typeof REACTIONS)[number];

const PRIORITY: Record<ReactionClip, number> = { curious: 1, happy: 2, celebrate: 3 };
const FADE_IN = 0.28;
const FADE_OUT = 0.55;

export class ClipDirector {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private current: ReactionClip | null = null;
  private idleSpeed = 1;
  readonly missing: ClipName[] = [];

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const name of ['idle', ...REACTIONS] as ClipName[]) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) {
        this.missing.push(name);
        continue;
      }
      const a = this.mixer.clipAction(clip);
      if (name === 'idle') {
        a.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.actions.get('idle')?.play();
  }

  /** The reaction now playing, or null when Buddy is idling. */
  get playing(): ReactionClip | null {
    return this.current;
  }

  /** How much idle is showing right now (1 when idling, 0 mid-reaction). */
  get idleWeight(): number {
    return this.actions.get('idle')?.getEffectiveWeight() ?? 1;
  }

  has(name: ClipName): boolean {
    return this.actions.has(name);
  }

  /** Ask for a reaction. Returns whether it started. */
  request(name: ReactionClip): boolean {
    const next = this.actions.get(name);
    if (!next) return false;
    if (this.current === name) return false;
    if (this.current && PRIORITY[name] < PRIORITY[this.current]) return false;
    const from = this.current ? this.actions.get(this.current)! : this.actions.get('idle');
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    if (from) next.crossFadeFrom(from, FADE_IN, false);
    // Idle keeps ticking underneath (at zero weight) so the return is seamless.
    const idle = this.actions.get('idle');
    if (idle && from !== idle) idle.fadeOut(FADE_IN);
    this.current = name;
    return true;
  }

  /** Idle runs faster while Buddy is excited (water pouring), and settles back. */
  setIdleSpeed(speed: number) {
    this.idleSpeed = speed;
  }

  update(dt: number) {
    const idle = this.actions.get('idle');
    if (idle) idle.timeScale += (this.idleSpeed - idle.timeScale) * Math.min(1, dt * 3);
    if (this.current) {
      const a = this.actions.get(this.current)!;
      const left = a.getClip().duration - a.time;
      if (left <= FADE_OUT || !a.isRunning()) {
        // Hand back to idle before the last frame, so nothing holds or snaps.
        if (idle) {
          // A fade to zero disables an action in three; switch idle back on first.
          idle.enabled = true;
          idle.setEffectiveWeight(1);
          idle.play();
          idle.crossFadeFrom(a, FADE_OUT, false);
        } else a.fadeOut(FADE_OUT);
        this.current = null;
      }
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot() as THREE.Object3D);
  }
}
