/**
 * The 3D tidepool behind Today (Phase 2). Loaded lazily after the numbers are on screen;
 * the flat drawing stays visible until the first frame has rendered.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildTidepool, type Quality } from './tidepool';
import { TidepoolController } from './controller';
import { createSound } from './audio';
import { makePip, usePipModel, type PipModel } from './models';
import { tidepoolBus } from './bus';

export type TidepoolProps = {
  fill: number;
  /** Today's goal is met: the bottle is corked. */
  corked: boolean;
  /** 0 = day, 1 = night. */
  night: number;
  reducedMotion: boolean;
  soundOn: boolean;
  onReady?: () => void;
};

const MAX_DPR = 1.75;

export default function TidepoolCanvas(props: TidepoolProps) {
  const model = usePipModel();
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [dpr, setDpr] = useState(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MAX_DPR));
  const [quality, setQuality] = useState<Quality>('high');

  // Stop drawing when the scene is scrolled off screen (the browser already pauses hidden tabs).
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Automatic quality drop: first lower the resolution, then the scene detail.
  const onSlow = () => {
    if (dpr > 1.01) setDpr(1);
    else if (quality === 'high') setQuality('low');
  };

  return (
    <div ref={wrap} className="tidepool-canvas" data-quality={quality} data-dpr={dpr}>
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={dpr}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        camera={{ fov: 36, near: 0.1, far: 140, position: [0.1, 2.5, 11.4] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        aria-hidden="true"
      >
        {model !== undefined && <Scene {...props} model={model} quality={quality} onSlow={onSlow} />}
      </Canvas>
    </div>
  );
}

function Scene({ fill, corked, night, reducedMotion, soundOn, onReady, quality, onSlow, model }: TidepoolProps & { quality: Quality; onSlow: () => void; model: PipModel | null }) {
  const { camera, size } = useThree();
  const sound = useMemo(() => createSound(), []);
  const env = useMemo(() => buildTidepool(quality), [quality]);
  // Built once: the controller keeps Pip's state across quality changes and re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctrl = useMemo(() => new TidepoolController({ fill, reducedMotion, sound, pip: makePip(model, fill) }), []);
  const ready = useRef(false);
  const perf = useRef({ frames: 0, time: 0, slowStreak: 0 });
  const look = useMemo(() => new THREE.Vector3(0, 2.0, 0), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => env.dispose(), [env]);
  useEffect(() => () => ctrl.dispose(), [ctrl]);
  useEffect(() => {
    ctrl.reducedMotion = reducedMotion;
  }, [ctrl, reducedMotion]);
  useEffect(() => {
    sound.enabled = soundOn;
  }, [sound, soundOn]);
  useEffect(() => {
    ctrl.syncFill(fill);
  }, [ctrl, fill]);
  // The first value is applied instantly; later changes animate.
  const corkSeen = useRef(false);
  useEffect(() => {
    ctrl.syncCorked(corked, !corkSeen.current || reducedMotion);
    corkSeen.current = true;
  }, [ctrl, corked, reducedMotion]);
  const nightSeen = useRef<typeof env | null>(null);
  useEffect(() => {
    env.setNight(night, nightSeen.current !== env || reducedMotion);
    nightSeen.current = env;
  }, [env, night, reducedMotion]);
  useEffect(
    () =>
      tidepoolBus.subscribe((e) => {
        if (e.type === 'pour') ctrl.pour(e.event);
        else if (e.type === 'undo') ctrl.undo(e.toFill);
        else ctrl.celebrate();
      }),
    [ctrl]
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    // Keep the bottle and Pip fully in frame at any aspect ratio.
    const aspect = size.width / Math.max(1, size.height);
    const dist = THREE.MathUtils.clamp(2.5 / (Math.tan(THREE.MathUtils.degToRad(18)) * aspect), 9.5, 16);
    const px = reducedMotion ? 0 : state.pointer.x * 0.45;
    const py = reducedMotion ? 0 : state.pointer.y * 0.22;
    target.set(0.1 + px, 2.5 + py, dist);
    camera.position.lerp(target, 1 - Math.exp(-4 * dt));
    camera.lookAt(look);

    env.update(dt, t, camera);
    ctrl.update(dt, t, camera);

    if (!ready.current) {
      ready.current = true;
      onReady?.();
      ctrl.greet();
    }

    // Average frame time over 2 s; three slow windows in a row trigger a quality step down.
    const p = perf.current;
    p.frames += 1;
    p.time += rawDt;
    if (p.time >= 2) {
      const avg = p.time / p.frames;
      p.slowStreak = avg > 1 / 40 ? p.slowStreak + 1 : 0;
      if (p.slowStreak >= 3) {
        p.slowStreak = 0;
        onSlow();
      }
      p.frames = 0;
      p.time = 0;
    }
  });

  return (
    <>
      <primitive object={env.group} />
      <primitive
        object={ctrl.group}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          ctrl.tap();
        }}
      />
    </>
  );
}
