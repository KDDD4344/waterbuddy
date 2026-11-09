/**
 * Choreography for Today: what Pip and the water do when a drink is logged, undone or
 * Pip is tapped. Kept free of React and of the renderer so it can be unit-tested by
 * stepping `update()` with a fake clock.
 */
import * as THREE from 'three';
import { buildPip, type PipRig } from './pip';
import { Particles } from './particles';
import { OUTPUT } from './shaders';
import type { Sound } from './audio';

export interface PourEvent {
  ml: number;
  fromFill: number;
  toFill: number;
  /** 25, 50, 75 or 100 when this drink crossed that line. */
  milestone: number | null;
  /** The goal was already met before this drink: record it, but no celebration (safety rule 1). */
  overGoal: boolean;
}

const silent: Sound = { enabled: false, pour() {}, tone() {}, chord() {} };

export class TidepoolController {
  readonly group = new THREE.Group();
  readonly pip: PipRig;
  reducedMotion: boolean;
  sound: Sound;
  /** True from tap until Pip has reacted. */
  pouring = false;

  private clock = 0;
  private timers: { at: number; fn: () => void }[] = [];
  private stream: THREE.Mesh;
  private streamMat: THREE.ShaderMaterial;
  private streamT = 0;
  private streamEnd = 0;
  private streamOn = false;
  private splash = new Particles(220, { color: 0xe2f8f3 });
  private bubbles = new Particles(180, { color: 0xe8fffb, ring: true });
  private latestFill: number;
  private latestCorked = false;
  private camera: THREE.Camera | null = null;
  private tmp = new THREE.Vector3();

  constructor({ fill = 0, reducedMotion = false, sound = silent }: { fill?: number; reducedMotion?: boolean; sound?: Sound } = {}) {
    this.reducedMotion = reducedMotion;
    this.sound = sound;
    this.latestFill = fill;
    this.pip = buildPip({ fill });
    this.pip.root.scale.setScalar(0.88);
    this.pip.root.position.set(-0.55, 0, 0.35);
    this.streamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec3 p = position; p.x += sin(uv.y * 14.0 + uTime * 16.0) * 0.012;
          vec4 w = modelMatrix * vec4(p, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uHead, uTail, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float s = 1.0 - vUv.y; if (s > uHead || s < uTail) discard;
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
          float st = 0.5 + 0.5 * sin(vUv.y * 90.0 + uTime * 40.0 + vUv.x * 12.566);
          vec3 c = mix(vec3(0.42, 0.78, 0.74), vec3(0.96, 1.0, 0.98), 0.25 * st + 0.6 * f);
          gl_FragColor = vec4(c, 0.88); ${OUTPUT} }`
    });
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 1, 16, 24, true), this.streamMat);
    this.stream.visible = false;
    this.stream.renderOrder = 4;
    this.group.add(this.pip.root, this.stream, this.splash.points, this.bubbles.points);
  }

  private after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.clock + seconds, fn });
  }

  /** Called whenever the stored total changes. Held back while a pour is playing. */
  syncFill(fill: number) {
    this.latestFill = fill;
    if (!this.pouring) this.pip.setFill(fill);
  }

  pour(e: PourEvent) {
    const pip = this.pip;
    this.latestFill = e.toFill;
    if (e.overGoal) {
      pip.trigger('nod');
      this.sound.tone(330, 0.25);
      return;
    }
    if (this.reducedMotion) {
      pip.setFill(e.toFill);
      pip.impulse(0.3, 0.2);
      pip.trigger('nod');
      this.sound.tone(330 * Math.pow(2, e.toFill * 1.4), 0.4);
      return;
    }
    if (this.pouring) {
      // Quick repeat taps: no new stream, but every drink still lands with a splash.
      pip.setFill(e.toFill);
      pip.impulse(0.8, 0.5);
      this.burst(14);
      this.streamEnd = Math.min(this.streamEnd + 0.4, 3);
      this.sound.tone(330 * Math.pow(2, e.toFill * 1.4), 0.3);
      if (e.milestone) this.pendingReaction = e.milestone;
      return;
    }
    this.pouring = true;
    this.pendingReaction = e.milestone;
    const m = pip.mouthWorld(new THREE.Vector3());
    pip.lookAt(new THREE.Vector3(m.x, m.y + 4, m.z));
    pip.setExpression('surprised');
    this.after(0.22, () => {
      pip.setHidden(true);
      pip.setExpression('idle');
    });
    const duration = Math.min(2, 0.75 + e.ml / 1000);
    this.after(0.32, () => {
      const top = 8;
      const mouth = pip.mouthWorld(this.tmp);
      const len = top - mouth.y;
      this.stream.scale.set(1, len, 1);
      this.stream.position.set(mouth.x, mouth.y + len / 2, mouth.z);
      this.stream.visible = true;
      this.streamOn = true;
      this.streamT = 0;
      this.streamEnd = duration;
      this.sound.pour(duration + 0.3, e.fromFill, e.toFill);
    });
    this.after(0.62, () => {
      pip.setFill(this.latestFill);
      pip.impulse(1.2, 0.7);
      this.burst(26);
      this.sound.tone(330 * Math.pow(2, e.toFill * 1.4), 0.4);
    });
    this.after(0.62 + duration + 0.35, () => this.react());
  }

  private pendingReaction: number | null = null;

  private react() {
    const pip = this.pip;
    pip.setHidden(false);
    if (this.camera) pip.lookAt(this.camera.position);
    const r = this.pendingReaction;
    if (r === 50 || r === 100) {
      pip.trigger('dance');
      this.sound.chord(r === 100 ? 523 : 392);
    } else {
      pip.trigger('cheer');
      if (r) this.sound.chord(349);
    }
    pip.setExpression('happy');
    this.pendingReaction = null;
    this.after(1.6, () => {
      pip.setExpression('idle');
      pip.lookAt(null);
      this.pouring = false;
      pip.setFill(this.latestFill);
      this.applyCork(false);
    });
  }

  /**
   * The bottle is corked while today's goal is met. Changes wait until a pour has
   * finished, so Pip never corks himself in mid-celebration.
   */
  syncCorked(corked: boolean, instant = false) {
    this.latestCorked = corked;
    if (instant) {
      this.pip.setCorked(corked, true);
      return;
    }
    if (!this.pouring) this.applyCork(false);
  }

  private applyCork(instant: boolean) {
    const want = this.latestCorked;
    if (want === this.pip.corked) return;
    this.pip.setCorked(want, instant);
    if (want) {
      this.pip.trigger('click');
      this.sound.tone(784, 0.12);
    }
  }

  undo(toFill: number) {
    this.latestFill = toFill;
    if (this.pouring) return;
    this.pip.setFill(toFill);
    this.pip.impulse(-0.6, 0.3);
    this.pip.trigger('peek');
  }

  /** Tapping Pip: a little wave or peek, a slosh and a soft note. */
  tap() {
    if (this.pouring) return;
    this.pip.trigger(Math.random() < 0.5 ? 'wave' : 'peek');
    this.pip.impulse(0.4, 0.4);
    this.sound.tone(520, 0.2);
  }

  /** A field task was finished: Pip dances and a ring of bubbles rises around the bottle. */
  celebrate() {
    if (this.pouring) return;
    this.pip.trigger(this.reducedMotion ? 'nod' : 'dance');
    this.pip.setExpression('happy');
    this.sound.chord(440);
    this.after(2.2, () => this.pip.setExpression('idle'));
    if (this.reducedMotion) return;
    const c = this.pip.root.position;
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      this.bubbles.spawn(
        new THREE.Vector3(c.x + Math.cos(a) * 1.9, 0.2 + Math.random() * 0.4, c.z + Math.sin(a) * 1.2),
        new THREE.Vector3(Math.cos(a) * 0.3, 1.6 + Math.random() * 1.6, Math.sin(a) * 0.3),
        2.2,
        0.12 + Math.random() * 0.12
      );
    }
  }

  /** Say hello when the scene first appears. */
  greet() {
    this.pip.trigger('wave');
    if (this.camera) this.pip.lookAt(this.camera.position);
    this.after(1.6, () => this.pip.lookAt(null));
  }

  private burst(n: number) {
    if (this.reducedMotion) return;
    const m = this.pip.mouthWorld(this.tmp);
    for (let i = 0; i < n; i++) {
      this.splash.spawn(
        m,
        new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.4 + Math.random() * 2.2, (Math.random() - 0.5) * 2.2),
        0.5 + Math.random() * 0.4,
        0.05 + Math.random() * 0.06
      );
    }
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    this.camera = camera;
    this.clock += dt;
    const due = this.timers.filter((x) => this.clock >= x.at);
    this.timers = this.timers.filter((x) => this.clock < x.at);
    due.forEach((x) => x.fn());

    this.streamMat.uniforms.uTime!.value = t;
    if (this.streamOn) {
      this.streamT += dt;
      this.streamMat.uniforms.uHead!.value = Math.min(1, this.streamT / 0.3);
      this.streamMat.uniforms.uTail!.value = this.streamT > this.streamEnd ? Math.min(1, (this.streamT - this.streamEnd) / 0.28) : 0;
      if (this.streamT < this.streamEnd + 0.2 && Math.random() < 0.7) {
        const m = this.pip.mouthWorld(this.tmp);
        this.splash.spawn(m, new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2), 0.4, 0.04 + Math.random() * 0.04);
        const c = this.pip.liquidCenterWorld(new THREE.Vector3());
        this.bubbles.spawn(
          new THREE.Vector3(c.x + (Math.random() - 0.5) * 1.6, c.y - 0.45, c.z + (Math.random() - 0.5) * 0.6),
          new THREE.Vector3(0, 0.9 + Math.random() * 0.6, 0),
          1.6,
          0.05 + Math.random() * 0.05
        );
      }
      if (this.streamT > this.streamEnd + 0.3) {
        this.streamOn = false;
        this.stream.visible = false;
      }
    }
    if (!this.reducedMotion && Math.random() < 0.012 && !this.pouring) {
      const m = this.pip.mouthWorld(this.tmp);
      this.bubbles.spawn(new THREE.Vector3(m.x + 0.1, m.y + 0.3, m.z + 0.2), new THREE.Vector3(0, 0.7, 0), 3.5, 0.08);
    }
    this.splash.update(dt, { gravity: -7, drag: 1.2 });
    this.bubbles.update(dt, { gravity: 0.6, drag: 0.8, fadeIn: 0.2 });
    this.pip.update(dt, t);
  }

  /** For tests and diagnostics. */
  get streamVisible() {
    return this.stream.visible;
  }

  dispose() {
    this.pip.dispose();
    this.splash.dispose();
    this.bubbles.dispose();
    this.stream.geometry.dispose();
    this.streamMat.dispose();
  }
}
