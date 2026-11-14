/**
 * HeroScene: owns the renderer and runs the spring.
 *
 * Each frame is drawn in up to three passes:
 *  1. The scene without the water surface, at reduced resolution, into a half-float target
 *     with a depth texture. The water samples it for refraction and for how deep it is.
 *  2. The full scene to the screen.
 *  3. Only when Bloop is on screen: the frame is copied to a texture and Bloop's jelly is
 *     drawn last, refracting the finished image behind it.
 * Shadows are rendered once per frame and reused by the later passes.
 */
import * as THREE from 'three';
import { Animator, type Reaction } from './animator';
import { makeRippleGlb, type GlbBuddy, type LoadState } from './buddies/rippleGlb';
import type { BuddyId } from './buddies/types';
import { buildLife, type Life } from './life';
import { Orbit } from './orbit';
import { buildPour, POUR_SECONDS, type Pour } from './pour';
import { SUN_DIR, shared } from './shared';
import { buildSparkles, type Sparkles } from './sparkles';
import { buildWater, type Water } from './water';
import { buildWorld, levelFor, SEAT, type Quality, type World } from './world';
import { createLabSound, type LabSound } from './labAudio';

export interface PourPlan {
  fromMl: number;
  toMl: number;
  goal: number;
  reachedGoal: boolean;
  pastGoal: boolean;
}

export interface SceneCallbacks {
  onDisplayMl(ml: number): void;
  onPourDone(plan: PourPlan): void;
  onQuality(q: { quality: Quality; dpr: number }): void;
  onReaction(kind: Reaction | 'touch', buddy: BuddyId): void;
  /**
   * Someone looked around or touched something in the scene. Purely for the interface (the
   * onboarding notices what's been tried); none of these ever log or change water.
   */
  onInteract?(what: Interactive): void;
  onContextLost(): void;
  /** Ripple's GLB: loading, ready, or failed (with a reason). */
  onBuddyState?(state: LoadState, detail?: string): void;
}

const tmpV = new THREE.Vector3();

export type Interactive = 'look' | 'zoom' | 'ripple' | 'water' | 'pad' | 'spout' | 'ground';

class Gaze {
  look = new THREE.Vector3(0, 1, 8);
  private want = new THREE.Vector3(0, 1, 8);
  private focusPoint: THREE.Vector3 | null = null;
  private focusUntil = 0;
  private hoverPoint = new THREE.Vector3();
  private hoverAt = -99;
  private nextPick = 0;
  private pickKind = 0;
  private poi: THREE.Vector3 | null = null;
  private wander = new THREE.Vector3();

  focus(p: THREE.Vector3, seconds: number, now: number, track = false) {
    this.focusPoint = track ? p : p.clone();
    this.focusUntil = now + seconds;
  }
  hover(p: THREE.Vector3, now: number) {
    this.hoverPoint.copy(p);
    this.hoverAt = now;
  }
  update(dt: number, now: number, camera: THREE.Camera, pois: THREE.Vector3[], head: THREE.Vector3) {
    if (this.focusPoint && now < this.focusUntil) this.want.copy(this.focusPoint);
    else if (now - this.hoverAt < 2.5) this.want.copy(this.hoverPoint);
    else {
      if (now >= this.nextPick) {
        this.nextPick = now + 1.4 + Math.random() * 2.6;
        const r = Math.random();
        this.pickKind = r < 0.55 ? 0 : r < 0.8 && pois.length ? 1 : 2;
        this.poi = pois.length ? pois[Math.floor(Math.random() * pois.length)]! : null;
        this.wander.set(
          head.x + (Math.random() - 0.5) * 4,
          head.y + (Math.random() - 0.3) * 1.2,
          head.z + 1 + Math.random() * 2
        );
      }
      if (this.pickKind === 0) this.want.copy(camera.position);
      else if (this.pickKind === 1 && this.poi) this.want.copy(this.poi);
      else this.want.copy(this.wander);
    }
    this.look.lerp(this.want, 1 - Math.exp(-dt * 7));
  }
}

export class HeroScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
  quality: Quality;
  private dpr: number;
  private maxDpr: number;
  private world: World;
  private water: Water;
  private life: Life;
  private pour: Pour;
  private sparkles: Sparkles;
  private orbit: Orbit;
  /** Ripple, the approved Buddy (an image-based reconstruction; see buddies/sprite.ts). */
  private buddy: GlbBuddy;
  private anim: Animator;
  private gaze = new Gaze();
  private rt: THREE.WebGLRenderTarget;
  /** Planar reflection of everything above the water (high tier only). */
  private reflRT: THREE.WebGLRenderTarget | null = null;
  private mirror = new THREE.PerspectiveCamera();
  private reflMat = new THREE.Matrix4();
  private reflPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private sound: LabSound = createLabSound();
  /** The glass in progress was logged after the goal: acknowledge it calmly, no reward. */
  private calm = false;
  private trailing = 0;
  private bubbleIn = 0;
  private reduced: boolean;
  private time = 0;
  private last = 0;
  private raf = 0;
  private progress: number;
  private shown: number;
  private level: number;
  private levelV = 0;
  private plan: PourPlan | null = null;
  private lastMl = -1;
  private flash = 0;
  private dripIn = 3;
  private spoutProxy: THREE.Mesh;
  private buddyBound = new THREE.Sphere();
  private coreBound = new THREE.Sphere();
  /** The latest pointer position for hover, handled once per frame. */
  private hoverNdc: THREE.Vector2 | null = null;
  private hoverDirty = false;
  /** Taps on Ripple while idling, for a little variety (happy, then curious "what is it?"). */
  private rippleTaps: number[] = [];
  /** What the pointer is over (desktop), for the cursor and a small welcome. */
  private hovered: Interactive | null = null;
  private hoveredPad: THREE.Object3D | null = null;
  /** Things not yet touched get an occasional, quiet nudge so people discover them. */
  private tried = new Set<Interactive>();
  private cueIn = 7;
  private lastInput = 0;
  private cueTurn = 0;
  private drip: { mesh: THREE.Mesh; v: THREE.Vector3; on: boolean };
  private seatTop = SEAT.clone();
  /** When Ripple last turned curious about something the person explored. */
  private curiousAt = -99;
  private pois: THREE.Vector3[] = [];
  /** Per frame: the gap since the last one, and the time this page spent working on it. */
  private frames: { gap: number; work: number }[] = [];
  private perfCheckIn = 1.5;
  private calls = 0;
  private triangles = 0;
  /**
   * Honest frame statistics, refreshed every 1.5 s (shown in Lab tools). `frameMs` is the median
   * gap between drawn frames; `workMs` the median time this page spent per frame (simulation plus
   * submitting draw calls, which blocks while the GPU is behind). GPU timer queries aren't used:
   * on Apple's ANGLE/Metal they include queueing between frames and read high.
   */
  stats = { fps: 0, frameMs: 0, p90Ms: 0, workMs: 0, calls: 0, triangles: 0 };
  private disposed = false;
  private frameCount = 0;
  private resizeObs: ResizeObserver | null = null;
  private rustle = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: {
      reduced: boolean;
      buddy: BuddyId;
      progress: number;
      callbacks: SceneCallbacks;
      quality?: Quality;
      maxDpr?: number;
      buddyLite?: boolean;
      /** False keeps the camera still (taps only), for a stage inside a scrolling screen. */
      explore?: boolean;
    }
  ) {
    this.reduced = opts.reduced;
    this.progress = this.shown = opts.progress;
    this.level = levelFor(opts.progress);
    const phone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.quality = opts.quality ?? (phone ? 'low' : 'high');
    this.maxDpr = opts.maxDpr ?? (this.quality === 'high' ? 2 : 1.75);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.setPixelRatio(this.dpr);
    this.renderer = r;
    canvas.addEventListener('webglcontextlost', this.lost);

    this.scene.fog = new THREE.FogExp2(shared.uFogColor.value.getHex(), shared.uFogDensity.value);
    this.scene.environment = this.makeEnvironment();
    this.scene.environmentIntensity = 0.55;

    this.world = buildWorld(r, this.quality);
    this.scene.add(this.world.group);
    this.water = buildWater(this.quality);
    this.scene.add(this.water.mesh);
    this.life = buildLife(r, this.quality === 'low');
    this.scene.add(this.life.group);
    this.pour = buildPour(this.world.spout.mouth, this.world.spout.dir, this.quality === 'high' ? 90 : 48);
    this.scene.add(this.pour.group);
    this.sparkles = buildSparkles();
    this.scene.add(this.sparkles.points);

    const dripMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xdff6ff })
    );
    dripMesh.visible = false;
    this.scene.add(dripMesh);
    this.drip = { mesh: dripMesh, v: new THREE.Vector3(), on: false };

    // The bamboo is thin; an invisible, fatter stand-in makes it easy to hit with a finger.
    const spoutLen = 1.45;
    this.spoutProxy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, spoutLen + 0.2, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.spoutProxy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.world.spout.dir);
    this.spoutProxy.position.copy(this.world.spout.mouth).addScaledVector(this.world.spout.dir, -spoutLen / 2);
    this.scene.add(this.spoutProxy);

    // Find the top of the seat stone and put every Buddy on it, facing the viewer.
    this.world.seat.updateMatrixWorld(true);
    this.raycaster.set(new THREE.Vector3(SEAT.x, 5, SEAT.z), new THREE.Vector3(0, -1, 0));
    const hit = this.raycaster.intersectObject(this.world.seat, false)[0];
    if (hit) this.seatTop.copy(hit.point);
    this.buddy = makeRippleGlb({
      lite: opts.buddyLite ?? this.quality === 'low',
      onState: (st, detail) => this.callbacks?.onBuddyState?.(st, detail)
    });
    this.buddy.root.position.copy(this.seatTop);
    this.buddy.root.rotation.y = 0.08;
    this.scene.add(this.buddy.root);
    this.anim = new Animator(this.buddy.temperament, this.reduced, 7);

    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(4, 4)
    });
    shared.uRefr.value = this.rt.texture;
    if (this.quality === 'high') {
      this.reflRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
      this.water.setReflection(this.reflRT.texture, this.reflMat);
    }
    shared.uDepth.value = this.rt.depthTexture;

    this.raycaster.layers.enableAll();
    this.orbit = new Orbit(canvas, {
      onTap: (ndc, held, coarse) => this.tap(ndc, held, coarse),
      onZoom: () => this.callbacks.onInteract?.('zoom'),
      onDrag: () => this.callbacks.onInteract?.('look'),
      onHover: (ndc) => {
        this.hoverNdc = ndc ? ndc.clone() : null;
        this.hoverDirty = true;
      },
      // Looking around the hollow makes Ripple curious too.
      onExplore: () => this.maybeCurious(this.orbit.az > 0 ? -1 : 1)
    });
    this.orbit.reduced = this.reduced;
    this.orbit.locked = opts.explore === false;
    this.callbacks = opts.callbacks;
    this.applyReduced();
    void this.buddy.load();

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(canvas);
    }
    this.callbacks.onQuality({ quality: this.quality, dpr: this.dpr });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private callbacks: SceneCallbacks;

  private makeEnvironment(): THREE.Texture {
    // A small sky for reflections: warm horizon, blue zenith, green ground, the sun.
    const envScene = new THREE.Scene();
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uSun: { value: SUN_DIR } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uSun; varying vec3 vP; void main(){
          vec3 c = mix(vec3(0.95, 0.9, 0.75), vec3(0.45, 0.65, 0.85), smoothstep(0.0, 0.6, vP.y));
          c = mix(vec3(0.2, 0.28, 0.14), c, smoothstep(-0.25, 0.05, vP.y));
          c += vec3(6.0, 5.0, 3.6) * pow(max(dot(vP, uSun), 0.0), 220.0);
          gl_FragColor = vec4(c, 1.0); }`
      })
    );
    envScene.add(m);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const tex = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
    return tex;
  }

  private lost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    this.callbacks.onContextLost();
  };

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Portrait: a wider lens and a step back, so Buddy, the pool and the spout still fit.
    this.camera.fov =
      aspect < 1 ? THREE.MathUtils.lerp(52, 40, THREE.MathUtils.clamp((aspect - 0.45) / 0.55, 0, 1)) : 38;
    this.orbit.fit = aspect < 1 ? (1 - aspect) * 2.2 : 0;
    this.orbit.portrait(aspect < 1);
    // Keep the middle of the scene in the part of the screen the controls don't cover.
    if (this.insetBottom > 0) this.camera.setViewOffset(w, h, 0, this.insetBottom * 0.32, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    shared.uRes.value.copy(size);
    shared.uNearFar.value.set(this.camera.near, this.camera.far);
    const s = this.quality === 'high' ? 0.6 : 0.45;
    this.rt.setSize(Math.max(2, Math.floor(size.x * s)), Math.max(2, Math.floor(size.y * s)));
    this.reflRT?.setSize(Math.max(2, Math.floor(size.x * 0.5)), Math.max(2, Math.floor(size.y * 0.5)));
    // Ripple's liquid skin samples a copy of the scene drawn behind it (three's transmission
    // pass). At full retina resolution that copy was the single most expensive thing in a
    // frame (about a third of it at 2560×1600), yet it's blurred by the skin's roughness, so
    // one sample per CSS pixel looks the same.
    this.renderer.transmissionResolutionScale = Math.min(1, 1 / this.dpr);
  }

  private insetBottom = 0;
  /** Height of controls covering the bottom of the canvas (CSS px). */
  setInsetBottom(px: number) {
    if (Math.abs(px - this.insetBottom) < 1) return;
    this.insetBottom = px;
    this.resize();
  }

  setReduced(r: boolean) {
    this.reduced = r;
    this.applyReduced();
  }

  private applyReduced() {
    const r = this.reduced;
    this.orbit.reduced = r;
    if (this.anim) this.anim.reduced = r;
    this.buddy?.setReduced(r);
    const motes = this.world.motes.material as THREE.ShaderMaterial;
    (motes.uniforms.uMotion as { value: number }).value = r ? 0.2 : 1;
    const swayScale = r ? 0.25 : 1;
    for (const m of this.world.rustlables) {
      const env = (m as THREE.Material & { env?: { uSway: { value: number } } }).env;
      if (env) {
        env.uSway.value = (m.userData.sway0 ??= env.uSway.value) * swayScale;
      }
    }
  }

  setSound(on: boolean) {
    this.sound.setEnabled(on);
  }

  /** Jump to a progress (used by Reset). */
  /** Set the day's progress; `ease` lets the spring settle to it (an undo) instead of jumping. */
  setProgress(p: number, ease = false) {
    this.progress = p;
    if (!ease) this.shown = p;
  }

  /** Lab tools: play a reaction clip directly. */
  react(kind: Reaction) {
    const side = this.gaze.look.x < this.seatTop.x ? -1 : 1;
    this.reactTo(kind, side);
  }

  /** Ripple's asset status and the clip now playing (for Lab tools). */
  get buddyInfo() {
    return {
      state: this.buddy.state,
      error: this.buddy.error,
      stats: this.buddy.stats,
      playing: this.buddy.director?.playing ?? null
    };
  }

  retryBuddy() {
    void this.buddy.load();
  }

  /**
   * Plays a reaction on the GLB (its clip, or the calm nod). The procedural animator runs
   * alongside only as a clock for scene beats tied to the clips (sparkles at the jump's apex,
   * ripples on landing); it is triggered only if the clip actually starts.
   */
  private reactTo(kind: Reaction, side = 1): boolean {
    const ok = this.buddy.react(kind === 'nod' ? 'nod' : kind);
    if (ok) {
      this.anim.trigger(kind, side);
      // Any celebration: look up with the jump and ease back, so the whole leap stays in frame.
      if (kind === 'celebrate') this.orbit.shot({ dist: 0.35, pol: 0.03, target: new THREE.Vector3(0, 0.55, 0) }, 2.6);
    }
    return ok;
  }

  private maybeCurious(side: number) {
    if (this.pouring || this.time - this.curiousAt < 4) return;
    if (this.reactTo('curious', side)) this.curiousAt = this.time;
  }

  /** Shift the framing: where the camera looks (x right, y up) and how far back it stands. */
  setFraming(x: number, y: number, dist = 0) {
    this.orbit.frameOffset.set(x, y, 0);
    this.orbit.frameDist = dist;
  }

  view(daz: number, dpol: number, zoom = 1) {
    this.orbit.nudge(daz, dpol, zoom);
  }

  get pouring(): boolean {
    return this.pour.active || this.plan !== null;
  }

  logGlass(plan: PourPlan) {
    if (this.pouring) return false;
    this.plan = plan;
    this.progress = Math.min(1, plan.toMl / plan.goal);
    this.calm = plan.pastGoal;
    this.pour.start(this.reduced);
    this.world.spout.kick(this.reduced ? 0.3 : 1);
    const now = this.time;
    this.gaze.focus(this.world.spout.mouth, 0.9, now);
    // Ripple watches the water arrive; its idle quickens with the stream (see flow below).
    // The reaction comes when the glass lands.
    // The camera leans gently toward the stream for the pour, then settles back.
    // On tall screens there's little room sideways, so the move is much smaller.
    const k = this.camera.aspect < 1 ? 0.3 : 1;
    const toward = this.world.spout.mouth
      .clone()
      .sub(this.orbit.target)
      .multiplyScalar(0.16 * k);
    toward.y = 0;
    this.orbit.shot(
      { az: (this.calm ? 0.02 : 0.05) * k, dist: (this.calm ? -0.1 : -0.3) * k, target: toward },
      POUR_SECONDS + 0.6
    );
    this.sound.pour(POUR_SECONDS, Math.min(1, plan.fromMl / plan.goal), Math.min(1, plan.toMl / plan.goal));
    return true;
  }

  /** Test hook: hold time still (frames keep drawing) so a moment can be inspected. */
  frozen = false;

  /** Test hook: run the world forward at a steady 60 fps and draw once (for screenshots in throttled tabs). */
  advance(seconds: number) {
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) this.update(1 / 60);
    this.render();
  }

  private headPos(): THREE.Vector3 {
    return tmpV.copy(this.seatTop).add(new THREE.Vector3(0, this.buddy.height * 0.8, 0));
  }

  /**
   * The closest interactive thing under a screen point (Ripple, a pad, the spout), if any.
   * Precise picking tests Ripple's skinned meshes (about 5 ms on an M5, fine for a tap); a
   * rough pick (for hover) stands Ripple in for a sphere first and skips it when the ray misses.
   */
  private pick(
    ndc: THREE.Vector2,
    rough = false
  ): { what: 'ripple' | 'pad' | 'spout'; hit: THREE.Intersection } | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const h0 = this.buddy.height;
    this.buddyBound.center.copy(this.seatTop).y += h0 * 0.55;
    this.buddyBound.radius = h0 * 0.62;
    const nearRipple = ray.intersectsSphere(this.buddyBound);
    const targets: THREE.Object3D[] = [...this.life.pads, this.spoutProxy];
    if (nearRipple && !rough) targets.push(...this.buddy.hit);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (nearRipple && !rough && !this.buddy.hit.includes(hits[0]?.object as THREE.Mesh)) {
      // Safety net: a tap squarely on Ripple's head or chest always counts, even if the exact
      // mesh test misses (seen once in QA: a tap on the chest read as the ground behind).
      const seat = this.seatTop;
      for (const [y, r] of [
        [0.88, 0.4],
        [0.42, 0.3]
      ] as const) {
        this.coreBound.center.set(seat.x, seat.y + y, seat.z);
        this.coreBound.radius = r;
        const at = ray.intersectSphere(this.coreBound, new THREE.Vector3());
        const d = at ? at.distanceTo(ray.origin) : Infinity;
        if (at && (!hits[0] || d < hits[0].distance))
          return { what: 'ripple', hit: { distance: d, point: at, object: this.buddy.root } as THREE.Intersection };
      }
    }
    if (nearRipple && rough) {
      // Rough: a hit on the sphere counts as Ripple unless a pad or the spout is nearer.
      const at = ray.intersectSphere(this.buddyBound, new THREE.Vector3());
      const d = at ? at.distanceTo(ray.origin) : Infinity;
      if (!hits[0] || d < hits[0].distance)
        return { what: 'ripple', hit: { distance: d, point: at!, object: this.buddy.root } as THREE.Intersection };
    }
    const h = hits[0];
    if (!h) return null;
    if (this.buddy.hit.includes(h.object as THREE.Mesh)) return { what: 'ripple', hit: h };
    if (h.object === this.spoutProxy) return { what: 'spout', hit: h };
    return { what: 'pad', hit: h };
  }

  private hover(ndc: THREE.Vector2 | null) {
    if (!ndc) {
      this.setHovered(null, null);
      return;
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    // Look at a point on a plane through Buddy, facing the camera.
    const n = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      n,
      this.seatTop.clone().add(new THREE.Vector3(0, 0.3, 0.8))
    );
    const p = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (p) this.gaze.hover(p, this.time);
    if (this.orbit.dragging) {
      this.canvas.style.cursor = '';
      return;
    }
    const got = this.pick(ndc, true);
    this.setHovered(got?.what ?? null, got?.what === 'pad' ? got.hit.object : null);
  }

  /** Desktop cue: a hand cursor over things that respond, and a small welcome as you arrive. */
  private setHovered(what: Interactive | null, pad: THREE.Object3D | null) {
    if (pad && pad !== this.hoveredPad && !this.reduced) this.life.poke(pad);
    if (what === 'spout' && this.hovered !== 'spout') this.world.spout.kick(0.6);
    this.hovered = what;
    this.hoveredPad = pad;
    this.canvas.style.cursor = what ? 'pointer' : '';
  }

  private tap(ndc: THREE.Vector2, held = 0, coarse = false) {
    this.lastInput = this.time;
    let got = this.pick(ndc);
    if (!got && coarse) {
      // Fingers are blunt: if the exact point missed, look a little around it (about 14 px).
      const r = this.canvas.getBoundingClientRect();
      const dx = (14 / Math.max(1, r.width)) * 2;
      const dy = (14 / Math.max(1, r.height)) * 2;
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [0.7, 0.7],
        [-0.7, 0.7],
        [0.7, -0.7],
        [-0.7, -0.7]
      ] as const) {
        // Rough picks here: eight precise passes over Ripple's skinned meshes would stall a phone.
        got = this.pick(new THREE.Vector2(ndc.x + ox * dx, ndc.y + oy * dy), true);
        if (got) break;
      }
    }
    const now = this.time;
    if (got?.what === 'ripple') {
      this.tapRipple(got.hit.point, ndc.x < 0 ? -1 : 1);
      return this.interacted('ripple');
    }
    if (got?.what === 'pad') {
      const l = this.life.poke(got.hit.object, got.hit.point);
      if (l) {
        const p = l.group.position;
        // A ring spreads from the pad's edge as it dips.
        this.water.addRipple(p.x, p.z, 0.7);
        this.sound.plink(0.85 + Math.random() * 0.2, 0.03);
        this.gaze.focus(p, 1.6, now, true);
        this.maybeCurious(p.x < this.seatTop.x ? -1 : 1);
      }
      return this.interacted('pad');
    }
    if (got?.what === 'spout') {
      this.tapSpout();
      return this.interacted('spout');
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    const levelPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -shared.uLevel.value);
    const onWater = this.raycaster.ray.intersectPlane(levelPlane, new THREE.Vector3());
    const hitGround = this.raycaster.intersectObject(this.world.terrain, false)[0];
    const waterDist = onWater ? onWater.distanceTo(this.raycaster.ray.origin) : Infinity;
    if (onWater && (!hitGround || waterDist < hitGround.distance)) {
      this.tapWater(onWater, held);
      return this.interacted('water');
    }
    if (hitGround) {
      for (const m of this.world.rustlables) {
        const env = (m as THREE.Material & { env?: { uRustle: { value: THREE.Vector3 } } }).env;
        env?.uRustle.value.set(hitGround.point.x, hitGround.point.z, 1);
      }
      this.rustle = 1;
      this.gaze.focus(hitGround.point, 1.4, now);
      this.maybeCurious(hitGround.point.x < this.seatTop.x ? -1 : 1);
      this.interacted('ground');
    }
  }

  private interacted(what: Interactive) {
    this.tried.add(what);
    this.lastInput = this.time;
    this.callbacks.onInteract?.(what);
  }

  /**
   * Ripple answers a tap according to what it's doing:
   *  - idling: a happy wiggle; after three taps within 6 s, a curious "what is it?" tilt,
   *  - mid-reaction: a ticklish giggle layered on top (the clip never restarts),
   *  - celebrating: joins in with a burst of sparkle, never interrupted,
   *  - watching a pour: a quick glance at you and a giggle, then back to the water.
   * Its eyes always come to you first.
   */
  private tapRipple(point: THREE.Vector3, side: number) {
    const now = this.time;
    const playing = this.buddy.director?.playing ?? null;
    this.callbacks.onReaction('touch', 'sprite');
    // Every tap counts toward "keep tapping" (including the giggles in between).
    this.rippleTaps = this.rippleTaps.filter((t) => now - t < 6);
    this.rippleTaps.push(now);
    if (this.pouring) {
      this.gaze.focus(this.camera.position, 0.7, now, true);
      this.buddy.react('giggle');
      this.sparkles.burst(point, 4, 0.3);
      return;
    }
    this.gaze.focus(this.camera.position, 1.6, now, true);
    if (playing === 'celebrate') {
      this.buddy.react('giggle');
      this.sparkles.burst(point, 12, 0.6);
      this.sound.plink(1.5, 0.04);
      return;
    }
    if (playing) {
      this.buddy.react('giggle');
      this.sparkles.burst(point, 5, 0.35);
      this.sound.plink(1.3 + Math.random() * 0.2, 0.035);
      return;
    }
    const kind = this.rippleTaps.length >= 3 ? 'curious' : 'happy';
    if (kind === 'curious') this.rippleTaps = [];
    this.reactTo(kind, side);
    this.sparkles.burst(point, 6, 0.4);
    this.sound.plink(1.2, 0.035);
  }

  /** A tap is a small, quick ring; a longer press is a bigger plunge with a rebound and spray. */
  private tapWater(at: THREE.Vector3, held: number) {
    const now = this.time;
    const press = THREE.MathUtils.clamp((held - 0.22) / 0.7, 0, 1);
    const strength = 0.7 + 1.4 * press;
    this.water.addRipple(at.x, at.z, strength);
    if (press > 0.3) {
      // The water springs back up where it was pushed: a second, smaller ring a moment later.
      this.water.addRipple(at.x, at.z, strength * 0.45, 0.32);
      if (!this.reduced && !this.pouring)
        this.pour.fling(at.clone().setY(this.level + 0.02), Math.round(4 + 8 * press));
      this.sound.splash(0.25 + 0.35 * press);
    } else this.sound.plink(0.8 + Math.random() * 0.4, 0.03);
    this.life.scare(at, 0.6 + 0.6 * press);
    this.gaze.focus(at, 1.8, now);
    this.maybeCurious(at.x < this.seatTop.x ? -1 : 1);
  }

  /**
   * The spout gives a short trickle: droplets only. It never starts a pour and never logs
   * water (logging is only ever the Pour button). Ignored while a glass is pouring.
   */
  private tapSpout() {
    const now = this.time;
    if (this.pouring || this.pour.spilling > 0.3) {
      this.world.spout.kick(0.6);
      return;
    }
    this.world.spout.kick(1.4);
    this.pour.spill(this.reduced ? 0.6 : 1.1);
    this.sound.plink(0.6, 0.04);
    this.gaze.focus(this.world.spout.mouth, 1.6, now);
    this.maybeCurious(1);
  }

  /**
   * Discovery: while nobody is touching anything, every so often one thing not yet tried
   * gives a quiet sign of life (a pad dips with a soft ring, the spout lets a few drops go,
   * Ripple glances at you). Stops for each thing once it has been touched.
   */
  private discover(dt: number) {
    if (this.pouring || this.buddy.state !== 'ready') return;
    this.cueIn -= dt;
    if (this.cueIn > 0 || this.time - this.lastInput < 6) return;
    this.cueIn = 9 + Math.random() * 4;
    const order: Interactive[] = ['pad', 'spout', 'ripple', 'water'];
    const left = order.filter((k) => !this.tried.has(k));
    if (!left.length) return;
    const what = left[this.cueTurn++ % left.length]!;
    if (what === 'pad') {
      const l = this.life.lilies[Math.floor(Math.random() * this.life.lilies.length)]!;
      this.life.poke(l.pad);
      this.water.addRipple(l.group.position.x, l.group.position.z, 0.35);
    } else if (what === 'spout') {
      this.world.spout.kick(0.8);
      this.pour.spill(0.35);
    } else if (what === 'ripple') {
      this.gaze.focus(this.camera.position, 1.4, this.time, true);
      this.buddy.react('nod');
    } else {
      const a = Math.random() * Math.PI * 2;
      this.water.addRipple(Math.cos(a) * 1.2, 0.2 + Math.sin(a) * 1.0, 0.4);
    }
  }

  private startDrip() {
    if (this.drip.on) return;
    this.drip.on = true;
    this.drip.mesh.visible = true;
    this.drip.mesh.position.copy(this.world.spout.mouth);
    this.drip.v.copy(this.world.spout.dir).multiplyScalar(0.35);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    const t0 = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    // Keep the world on real time even when frames are slow: step the simulation in small
    // slices (cheap) and draw once (expensive). A pour always takes the same seconds.
    const real = Math.min(1, Math.max(0, (now - this.last) / 1000));
    const gap = now - this.last;
    this.last = now;
    const steps = this.frozen ? 0 : Math.min(40, Math.max(1, Math.ceil(real / (1 / 30))));
    for (let i = 0; i < steps; i++) this.update(real / steps);
    // While Ripple's GLB is still being parsed, draw every third frame: on slow devices the
    // loader's steps otherwise queue behind expensive frames.
    this.frameCount++;
    if (this.buddy.state === 'loading' && this.frameCount % 3 !== 0) return;
    this.render();
    this.frames.push({ gap, work: performance.now() - t0 });
    this.adapt(real);
  };

  /** Measurement hook: hold the resolution steady (adaptive quality off). */
  adaptive = true;

  private adapt(dt: number) {
    this.perfCheckIn -= dt;
    if (this.perfCheckIn > 0) return;
    this.perfCheckIn = 1.5;
    // Gaps over a second are pauses (a tab coming back), not speed. Timing can't tell a
    // throttled embed from a GPU-bound phone (both show long gaps and little page work; checked
    // under SwiftShader), so every other frame counts and recovery upward is quick instead.
    const f = document.hidden ? [] : this.frames.filter((x) => x.gap < 1000);
    this.frames = [];
    const med = (a: number[], q = 0.5) => {
      const b = [...a].sort((x, y) => x - y);
      return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * q))]! : 0;
    };
    const gaps = f.map((x) => x.gap);
    this.stats = {
      fps: gaps.length ? Math.round(1000 / med(gaps)) : 0,
      frameMs: +med(gaps).toFixed(1),
      p90Ms: +med(gaps, 0.9).toFixed(1),
      workMs: +med(f.map((x) => x.work)).toFixed(1),
      calls: this.calls,
      triangles: this.triangles
    };
    if (!this.adaptive || f.length < 5) return;
    const typical = med(gaps);
    const device = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    let next = this.dpr;
    // Aim for a steady 50–60 fps; step down below 50, back up only with clear headroom.
    if (typical > 60) next = 0.75;
    else if (typical > 20) next = Math.max(1, this.dpr - 0.25);
    else if (typical < 12) next = Math.min(device, this.dpr + (typical < 8 ? 0.5 : 0.25));
    if (Math.abs(next - this.dpr) > 0.01) {
      this.dpr = next;
      this.resize();
      this.callbacks.onQuality({ quality: this.quality, dpr: this.dpr });
    }
  }

  private update(dt: number) {
    this.time += dt;
    const t = this.time;
    shared.uTime.value = t;

    // Progress shown in the world: during a pour it follows the water actually landing.
    if (this.plan) {
      const p = this.plan;
      const ml = p.fromMl + (p.toMl - p.fromMl) * this.pour.fill;
      this.shown = Math.min(1, ml / p.goal);
      const rounded = Math.round(ml / 5) * 5;
      if (rounded !== this.lastMl) {
        this.lastMl = rounded;
        this.callbacks.onDisplayMl(rounded);
      }
    } else {
      this.shown += (this.progress - this.shown) * (1 - Math.exp(-dt * 3));
    }
    const want = levelFor(this.shown);
    this.levelV += ((want - this.level) * 26 - this.levelV * (this.reduced ? 12 : 7)) * dt;
    this.level += this.levelV * dt;
    shared.uLevel.value = this.level;
    shared.uLush.value += (this.shown - shared.uLush.value) * (1 - Math.exp(-dt * 1.5));
    this.flash = Math.max(0, this.flash - dt * 0.35);
    this.world.shafts.intensity.value = 0.55 + 0.5 * shared.uLush.value + this.flash * 0.9;
    this.world.ferns.setLush(shared.uLush.value);
    if (this.rustle > 0) {
      this.rustle = Math.max(0, this.rustle - dt * 0.8);
      for (const m of this.world.rustlables) {
        const env = (m as THREE.Material & { env?: { uRustle: { value: THREE.Vector3 } } }).env;
        if (env) env.uRustle.value.z = this.rustle;
      }
    }

    const motes = (this.world.motes.material as THREE.ShaderMaterial).uniforms.uSwirl!.value as THREE.Vector4;
    for (const ev of this.pour.update(dt, this.water)) {
      if (ev === 'impact') {
        const i = this.pour.impact;
        this.life.scare(i, 1.2);
        this.gaze.focus(i, POUR_SECONDS, this.time, true);
        this.sound.splash(this.calm ? 0.6 : 1);
        if (!this.calm) motes.set(i.x, i.y + 0.6, i.z, 1);
        // The ferns by the spout shiver as the water lands.
        for (const m of this.world.rustlables) {
          const env = (m as THREE.Material & { env?: { uRustle: { value: THREE.Vector3 } } }).env;
          env?.uRustle.value.set(i.x + 0.8, i.z - 0.6, 0.7);
        }
        this.rustle = 0.7;
      }
      if (ev === 'done' && this.plan) this.finishPour(this.plan);
    }
    motes.w *= Math.exp(-dt * 0.8);

    // Bubbles chatter under the stream while it runs.
    if (this.pour.flow > 0.5) {
      this.bubbleIn -= dt;
      if (this.bubbleIn <= 0) {
        this.bubbleIn = 0.12 + Math.random() * 0.25;
        this.sound.plink(0.7 + Math.random() * 0.9, 0.025);
      }
    }
    // Idle drips from the spout keep the water alive between glasses; a pour ends with a
    // couple of trailing drips, like a real spout emptying.
    if (!this.pour.active) {
      this.dripIn -= dt;
      if (this.dripIn <= 0) {
        if (this.trailing > 0) {
          this.trailing--;
          this.dripIn = this.trailing > 0 ? 0.7 : 3 + Math.random() * 4;
        } else this.dripIn = 3 + Math.random() * 4;
        this.startDrip();
      }
    }
    if (this.drip.on) {
      this.drip.v.y -= 4.6 * dt;
      this.drip.mesh.position.addScaledVector(this.drip.v, dt);
      if (this.drip.mesh.position.y <= this.level) {
        this.drip.on = false;
        this.drip.mesh.visible = false;
        this.water.addRipple(this.drip.mesh.position.x, this.drip.mesh.position.z, 0.45);
        this.sound.plink(1.1 + Math.random() * 0.3, 0.05);
      }
    }

    this.water.update(dt);
    this.life.interesting(this.pois);
    this.life.update(dt, t, shared.uLush.value, this.water, this.flash);
    this.discover(dt);
    if (this.hoverDirty) {
      this.hoverDirty = false;
      this.hover(this.hoverNdc);
    }

    const buddy = this.buddy;
    const anim = this.anim;
    this.gaze.update(dt, t, this.camera, this.pois, this.headPos().clone());
    const pose = anim.update(dt);
    for (const e of anim.drainEvents()) {
      if (e === 'apex' && anim.playing === 'celebrate') {
        // At the top of the jump Ripple shakes off water, with a few sparkles of light.
        const top = this.headPos()
          .clone()
          .add(new THREE.Vector3(0, 0.25, 0));
        if (!this.reduced) this.pour.fling(top, 22);
        this.sparkles.burst(top, this.reduced ? 10 : 24, 0.9);
      }
      if (e === 'land') {
        this.water.addRipple(this.seatTop.x + 0.7, this.seatTop.z + 0.3, 0.6);
        this.water.addRipple(this.seatTop.x - 0.7, this.seatTop.z + 0.1, 0.5, 0.08);
      }
    }
    buddy.apply(pose, {
      t,
      dt,
      progress: shared.uLush.value,
      look: this.gaze.look,
      camera: this.camera,
      refraction: null,
      resolution: shared.uRes.value,
      flow: this.pour.flow * (this.calm ? 0.25 : 1),
      reduced: this.reduced
    });

    const px =
      this.renderer.getDrawingBufferSize(new THREE.Vector2()).y /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.world.update(dt, this.camera, px);
    this.sparkles.update(dt, px);
    this.orbit.update(dt, this.camera);
  }

  private finishPour(plan: PourPlan) {
    this.plan = null;
    this.lastMl = -1;
    this.callbacks.onDisplayMl(plan.toMl);
    // Logged before the goal: happy. The glass that reaches it: the day's one celebration.
    // After it: a calm nod, never a reward.
    const kind: Reaction = plan.reachedGoal ? 'celebrate' : plan.pastGoal ? 'nod' : 'happy';
    this.reactTo(kind, 1);
    this.gaze.focus(this.camera.position, 2.5, this.time, true);
    this.trailing = 2;
    this.dripIn = 0.35;
    // The pool settles with one wide ring from where the water landed.
    this.water.addRipple(this.pour.impact.x, this.pour.impact.z, plan.pastGoal ? 0.6 : 1.3, 0.05);
    if (plan.reachedGoal) {
      // The day's one celebration gets its own framing.
      this.life.celebrate();
      this.flash = 1;
      this.sound.celebrate();
    } else if (plan.pastGoal) {
      // Logged accurately, acknowledged quietly. No sparkle, light or melody.
      this.sound.tick();
    } else {
      this.flash = Math.max(this.flash, 0.3);
      this.sound.chime(Math.max(0, Math.round(plan.toMl / 250) - 1));
      this.sparkles.burst(
        this.headPos()
          .clone()
          .add(new THREE.Vector3(0, 0.2, 0)),
        10,
        0.5
      );
    }
    this.callbacks.onReaction(kind, 'sprite');
    this.callbacks.onPourDone(plan);
  }

  private render() {
    const r = this.renderer;
    // Count every pass (shadow, refraction, reflection, transmission, main) as one frame.
    r.info.autoReset = false;
    r.info.reset();
    r.shadowMap.needsUpdate = true;
    // The water's refraction pass doesn't need Buddy (it floats above the surface), and
    // leaving its liquid skin out saves a transmission pass.
    this.water.mesh.visible = false;
    const skip = [...this.buddy.refractionHidden, ...this.world.aboveWater];
    const was = skip.map((o) => o.visible);
    for (const o of skip) o.visible = false;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    skip.forEach((o, i) => (o.visible = was[i]!));
    if (this.reflRT) this.renderReflection();
    this.water.mesh.visible = true;
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
    this.calls = r.info.render.calls;
    this.triangles = r.info.render.triangles;
  }

  /** Renders the scene mirrored in the water surface, clipped at the waterline. */
  private renderReflection() {
    const r = this.renderer;
    const L = this.level;
    const cam = this.camera;
    const look = cam.getWorldDirection(new THREE.Vector3()).add(cam.position);
    this.mirror.position.set(cam.position.x, 2 * L - cam.position.y, cam.position.z);
    this.mirror.up.set(0, -1, 0);
    this.mirror.lookAt(look.x, 2 * L - look.y, look.z);
    this.mirror.near = cam.near;
    this.mirror.far = cam.far;
    this.mirror.updateMatrixWorld();
    this.mirror.projectionMatrix.copy(cam.projectionMatrix);
    this.mirror.layers.mask = cam.layers.mask;
    this.reflMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflMat.multiply(this.mirror.projectionMatrix).multiply(this.mirror.matrixWorldInverse);
    this.reflPlane.constant = -(L - 0.01);
    // Ripple's skin skips transmission here: it would cost another full-resolution pass.
    const liquid = this.buddy.liquidMaterials();
    for (const m of liquid) {
      m.userData.t0 ??= m.transmission;
      m.transmission = 0;
    }
    // Light shafts and motes are volume effects; mirrored they read as streaks, so skip them.
    this.world.shafts.mesh.visible = false;
    this.world.motes.visible = false;
    r.clippingPlanes = [this.reflPlane];
    r.setRenderTarget(this.reflRT);
    r.render(this.scene, this.mirror);
    r.clippingPlanes = [];
    this.world.shafts.mesh.visible = true;
    this.world.motes.visible = true;
    for (const m of liquid) m.transmission = m.userData.t0 as number;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.orbit.dispose();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.buddy.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.rt.dispose();
    this.reflRT?.dispose();
    this.sound.dispose();
    this.renderer.dispose();
  }
}
