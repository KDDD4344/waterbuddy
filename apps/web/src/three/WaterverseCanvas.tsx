/**
 * The Waterverse in 3D (Phase 5). Lazy-loaded; the flat chart and the list of places work
 * without it. Drag to pan, pinch or scroll to zoom, tap an island to fly to it.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Waterverse } from './waterverse';
import { createSound } from './audio';
import { makePip, usePipModel, type PipModel } from './models';
import { HARBOUR, ISLANDS, type IslandStatus } from '../domain/atlas';

export type WaterverseProps = {
  status: IslandStatus[];
  /** Voyage to play once on arrival: start island (-1 = harbour) and islands to reveal. */
  from: number;
  arrivals: number[];
  selected: number | null;
  onSelect: (island: number) => void;
  onArrive: (island: number) => void;
  reducedMotion: boolean;
  soundOn: boolean;
  onReady?: () => void;
  /** One element per island; positioned over the island every frame. */
  labels: MutableRefObject<(HTMLElement | null)[]>;
};

const MAX_DPR = 1.75;
const BOUNDS = { minX: -20, maxX: 22, minZ: -24, maxZ: 18 };
const OFFSET = new THREE.Vector3(0, 19, 15);

export default function WaterverseCanvas(props: WaterverseProps) {
  const model = usePipModel();
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [dpr, setDpr] = useState(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MAX_DPR));

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className="waterverse-canvas" data-dpr={dpr}>
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={dpr}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        camera={{ fov: 40, near: 0.1, far: 200, position: [HARBOUR.x, OFFSET.y, HARBOUR.z + OFFSET.z] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
        aria-hidden="true"
      >
        {model !== undefined && <Scene {...props} model={model} onSlow={() => setDpr((d) => (d > 1.01 ? 1 : d))} />}
      </Canvas>
    </div>
  );
}

function Scene({ status, from, arrivals, selected, onSelect, onArrive, reducedMotion, soundOn, onReady, labels, onSlow, model }: WaterverseProps & { onSlow: () => void; model: PipModel | null }) {
  const { camera, gl, size } = useThree();
  const sound = useMemo(() => createSound(), []);
  // Built once; it keeps the voyage state across re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const world = useMemo(() => new Waterverse({ reducedMotion, sound, pip: makePip(model, 1) }), []);
  const controls = useMemo(() => {
    const c = new MapControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.screenSpacePanning = false;
    c.minDistance = 9;
    c.maxDistance = 42;
    c.maxPolarAngle = 1.05;
    c.minPolarAngle = 0.35;
    c.enableRotate = false;
    c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    return c;
  }, [camera, gl]);
  const fly = useRef<THREE.Vector3 | null>(null);
  const started = useRef(false);
  const ready = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const perf = useRef({ frames: 0, time: 0, slow: 0 });
  const arriveRef = useRef(onArrive);
  arriveRef.current = onArrive;

  useEffect(() => () => controls.dispose(), [controls]);
  useEffect(() => () => world.dispose(), [world]);
  useEffect(() => {
    world.reducedMotion = reducedMotion;
  }, [world, reducedMotion]);
  useEffect(() => {
    sound.enabled = soundOn;
  }, [sound, soundOn]);

  // First load: show what was already clear, then sail to anything new.
  useEffect(() => {
    if (started.current) {
      world.setStatus(status);
      return;
    }
    started.current = true;
    world.setStatus(status, true);
    world.voyage(from, arrivals, (i) => arriveRef.current(i));
    const start = world.focus;
    controls.target.set(start.x, 0, start.z);
    camera.position.copy(controls.target).add(OFFSET);
    controls.update();
  }, [world, status, from, arrivals, controls, camera]);

  useEffect(() => {
    if (selected === null) return;
    const isl = ISLANDS[selected];
    if (isl) fly.current = new THREE.Vector3(isl.x, 0, isl.z + 1.5);
  }, [selected]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    world.update(dt, state.clock.elapsedTime);

    // Follow the bottle while it sails; otherwise fly to a chosen island; otherwise free.
    const goal = world.busy ? world.focus : fly.current;
    controls.enabled = !world.busy;
    if (goal) {
      tmp.copy(goal).sub(controls.target);
      const k = 1 - Math.exp(-(reducedMotion ? 30 : 3.2) * dt);
      controls.target.addScaledVector(tmp, k);
      camera.position.addScaledVector(tmp, k);
      // ease the zoom toward a comfortable distance
      const want = world.busy ? 22 : 19;
      const dist = camera.position.distanceTo(controls.target);
      camera.position.sub(controls.target).multiplyScalar(1 + ((want - dist) / dist) * k).add(controls.target);
      if (!world.busy && tmp.lengthSq() < 0.002) fly.current = null;
    }
    // keep the map on screen
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, BOUNDS.minX, BOUNDS.maxX) - t.x;
    const cz = THREE.MathUtils.clamp(t.z, BOUNDS.minZ, BOUNDS.maxZ) - t.z;
    t.x += cx;
    t.z += cz;
    camera.position.x += cx;
    camera.position.z += cz;
    controls.update();

    // island labels follow their islands on screen
    ISLANDS.forEach((isl, i) => {
      const el = labels.current[i];
      if (!el) return;
      tmp.set(isl.x, 2.4, isl.z).project(camera);
      const onScreen = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
      el.style.opacity = onScreen ? '1' : '0';
      el.style.transform = `translate(-50%, -100%) translate(${((tmp.x + 1) / 2) * size.width}px, ${((1 - tmp.y) / 2) * size.height}px)`;
    });

    if (!ready.current) {
      ready.current = true;
      onReady?.();
    }
    const p = perf.current;
    p.frames += 1;
    p.time += rawDt;
    if (p.time >= 2) {
      p.slow = p.time / p.frames > 1 / 40 ? p.slow + 1 : 0;
      if (p.slow >= 3) {
        p.slow = 0;
        onSlow();
      }
      p.frames = 0;
      p.time = 0;
    }
  });

  return (
    <primitive
      object={world.group}
      onClick={(e: { stopPropagation: () => void; delta: number; object: THREE.Object3D }) => {
        if (e.delta > 8) return; // that was a drag, not a tap
        const i = world.islandOf(e.object);
        if (i >= 0) {
          e.stopPropagation();
          onSelect(i);
        }
      }}
    />
  );
}
