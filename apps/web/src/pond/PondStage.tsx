/**
 * Ripple's spring, as a stage inside the app. It runs the Hero Lab's scene (engine/scene.ts):
 * the same GLB, pond, pour, reactions and touch responses. This module is loaded lazily, so
 * the app never waits for three.js. Logging talks to it through `tidepoolBus`.
 */
import { useEffect, useRef } from 'react';
import { HeroScene, type Interactive } from '../lab/engine/scene';
import { tidepoolBus } from '../three/bus';

export interface PondStageProps {
  /** Today's progress toward the goal, 0..1. */
  progress: number;
  /** True: the camera can be turned and zoomed (Atlas). False: taps only (Today). */
  explore: boolean;
  reduced: boolean;
  sound: boolean;
  className?: string;
  onReady?(): void;
  onError?(): void;
  onInteract?(what: Interactive): void;
  /** For keyboard control of the camera (Atlas). */
  onScene?(scene: HeroScene | null): void;
}

function hooksAllowed(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('dev');
  } catch {
    return false;
  }
}

export default function PondStage(props: PondStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: HeroScene;
    let readied = false;
    const ready = () => {
      if (readied) return;
      readied = true;
      latest.current.onReady?.();
    };
    try {
      scene = new HeroScene(canvas, {
        reduced: props.reduced,
        buddy: 'sprite',
        progress: props.progress,
        explore: props.explore,
        callbacks: {
          onDisplayMl: () => {},
          onPourDone: () => {},
          onQuality: () => {},
          onReaction: () => {},
          onContextLost: () => latest.current.onError?.(),
          // The pond is worth showing once Ripple has arrived (or failed to: the spring still works).
          onBuddyState: (st) => {
            if (st !== 'loading') ready();
          },
          onInteract: (what) => latest.current.onInteract?.(what)
        }
      });
    } catch {
      latest.current.onError?.();
      return;
    }
    scene.setSound(props.sound);
    // Today: the big number sits top-left, so Ripple moves right and the view widens a little.
    if (!props.explore) scene.setFraming(-1.25, 0.42, 0.45);
    sceneRef.current = scene;
    latest.current.onScene?.(scene);
    const w = window as unknown as { __pond?: HeroScene };
    if (hooksAllowed()) w.__pond = scene;
    const off = tidepoolBus.subscribe((e) => {
      if (e.type === 'pour') {
        const ev = e.event;
        const goal = ev.goalMl ?? 2000;
        const ok = scene.logGlass({
          fromMl: ev.fromMl ?? ev.fromFill * goal,
          toMl: ev.toMl ?? ev.toFill * goal,
          goal,
          reachedGoal: ev.celebrate === true,
          pastGoal: ev.overGoal
        });
        // A second drink while one is still pouring: the spring just rises to match.
        if (!ok) scene.setProgress(ev.toFill, true);
      } else if (e.type === 'undo') scene.setProgress(e.toFill, true);
      else if (e.type === 'celebrate') scene.react('celebrate');
    });
    return () => {
      off();
      if (w.__pond === scene) delete w.__pond;
      latest.current.onScene?.(null);
      scene.dispose();
      sceneRef.current = null;
    };
    // The scene is made once; later changes are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sceneRef.current?.setReduced(props.reduced), [props.reduced]);
  useEffect(() => sceneRef.current?.setSound(props.sound), [props.sound]);
  // Edits, deletes, another tab or a new day: the spring settles to the true level.
  useEffect(() => {
    const s = sceneRef.current;
    if (s && !s.pouring) s.setProgress(props.progress, true);
  }, [props.progress]);

  return <canvas ref={canvasRef} className={props.className} aria-hidden="true" />;
}
