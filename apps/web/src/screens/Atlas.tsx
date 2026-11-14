import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Profile } from '../data/db';
import { addDiscovery, DISCOVERABLE, logsForDay, updateProfile } from '../data/repo';
import { Pond } from '../components/Pond';
import { useToday } from '../hooks/useToday';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useLogDrink } from '../hooks/useLogDrink';
import { useToast } from '../ui/toast';
import { formatAmount } from '../domain/units';
import { canRunLive3d, canUseWebGL, forceLive3d } from '../three/webgl';
import type { HeroScene } from '../lab/engine/scene';

const GUIDE_KEY = 'wb-atlas-guide-done';
const FOUND_NAMES: Record<string, string> = {
  ripple: 'Ripple',
  water: 'The water',
  pad: 'A lily pad',
  spout: 'The spout'
};

function storeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the guide just shows again next time.
  }
}

/**
 * Atlas: Ripple's spring, to explore. Drag to look around, pinch or scroll to come closer,
 * and touch Ripple, the water, the lily pads and the bamboo spout. Today's quest is to find
 * all four; what's found shows in the Journal. Pouring here logs a drink exactly like Today.
 */
export function Atlas({ profile }: { profile: Profile }) {
  const today = useToday();
  const logs = useLiveQuery(() => logsForDay(today), [today]);
  const disc = useLiveQuery(() => db.discoveries.get(today), [today]);
  const vessels = useLiveQuery(() => db.vessels.orderBy('order').toArray(), []);
  const reduced = useReducedMotion(profile.reduceMotion);
  const toast = useToast();
  const log = useLogDrink(profile);
  const scene = useRef<HeroScene | null>(null);
  const [guide, setGuide] = useState(() => storeGet(GUIDE_KEY) === null);
  const [looked, setLooked] = useState(false);

  const total = (logs ?? []).reduce((s, l) => s + l.ml, 0);
  const fill = Math.min(1, total / profile.goalMl);
  const fmt = (ml: number) => formatAmount(ml, profile.units, profile.cupMl);
  const found = disc?.found ?? [];
  const pourVessel = vessels?.find((v) => v.ml === 250) ?? vessels?.[0];
  const want3d = profile.scene3d !== false;
  const [forced, setForced] = useState(false);
  const can3d = want3d && (canRunLive3d() || forced);
  const slowOnly = want3d && canUseWebGL() && !can3d;

  const closeGuide = () => {
    setGuide(false);
    storeSet(GUIDE_KEY, '1');
  };

  const onInteract = async (what: string) => {
    if (what === 'look' || what === 'zoom') {
      setLooked(true);
      return;
    }
    if (what === 'ground') return;
    const done = await addDiscovery(today, what);
    if (done) toast({ text: 'Today’s quest is complete: you found all four things in the spring.' });
  };
  // Someone who has looked around and found something has got the idea.
  const explored = looked && found.length > 0;
  useEffect(() => {
    if (explored) storeSet(GUIDE_KEY, '1');
  }, [explored]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = scene.current;
    if (!s) return;
    const map: Record<string, [number, number, number]> = {
      ArrowLeft: [0.12, 0, 1],
      ArrowRight: [-0.12, 0, 1],
      ArrowUp: [0, -0.06, 1],
      ArrowDown: [0, 0.06, 1],
      '+': [0, 0, 0.9],
      '=': [0, 0, 0.9],
      '-': [0, 0, 1.1]
    };
    const m = map[e.key];
    if (m) {
      e.preventDefault();
      s.view(...m);
      setLooked(true);
    }
  };

  return (
    <main className="screen spring-screen">
      <div
        className="spring-stage"
        role="application"
        aria-roledescription="3D scene"
        aria-label="Ripple’s spring. Arrow keys look around; plus and minus zoom."
        tabIndex={0}
        onKeyDown={onKey}
      >
        <Pond
          variant="atlas"
          want3d={want3d}
          progress={fill}
          explore
          reduced={reduced}
          sound={profile.sound === true}
          onInteract={(w) => void onInteract(w)}
          onScene={(s) => (scene.current = s)}
        />
      </div>

      <header className="spring-top">
        <h1 className="spring-title">The spring</h1>
        <section className="quest" aria-label="Today’s quest">
          <p className="label">Today&rsquo;s quest</p>
          <p className="quest-line">
            <span className="quest-long">Find the four things that respond · </span>
            <b>{found.length} of 4</b>
            <span className="quest-short"> found</span>
          </p>
          <ul className="quest-marks">
            {DISCOVERABLE.map((k) => (
              <li key={k} data-found={found.includes(k) || undefined}>
                {FOUND_NAMES[k]}
                <span className="sr-only">{found.includes(k) ? ', found' : ', not found yet'}</span>
              </li>
            ))}
          </ul>
        </section>
      </header>

      {!can3d && (
        <div className="note calm spring-off" role="status">
          <p className="label">The spring is a 3D scene</p>
          {slowOnly ? (
            <>
              <p>
                This device draws 3D without a graphics chip, so it would be slow. The spring stays still; logging works
                as usual.
              </p>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  forceLive3d();
                  setForced(true);
                }}
              >
                Show it anyway
              </button>
            </>
          ) : want3d ? (
            <p>
              This browser can&rsquo;t show 3D graphics, so the spring stays still. Logging works as usual on Today.
            </p>
          ) : (
            <>
              <p>3D is turned off in You, so the spring stays still.</p>
              <button type="button" className="btn ghost" onClick={() => void updateProfile({ scene3d: true })}>
                Turn on 3D
              </button>
            </>
          )}
        </div>
      )}

      {can3d && guide && (
        <section className="coach" aria-labelledby="coach-title" onKeyDown={(e) => e.key === 'Escape' && closeGuide()}>
          <p id="coach-title" className="label">
            Explore the spring
          </p>
          <ul>
            <li data-done={looked || undefined}>Drag to look around; pinch or scroll to come closer.</li>
            <li data-done={found.length > 0 || undefined}>Tap Ripple, the water, a lily pad or the spout.</li>
            <li>Only pouring logs water.</li>
          </ul>
          <button type="button" className="btn ghost" onClick={closeGuide}>
            Got it
          </button>
        </section>
      )}

      <div className="spring-dock">
        <p className="spring-total">
          <b>{fmt(total)}</b> of {fmt(profile.goalMl)}
        </p>
        {can3d && !guide && (
          <button type="button" className="btn ghost small" onClick={() => setGuide(true)}>
            How to explore
          </button>
        )}
        {pourVessel && (
          <button type="button" className="btn primary spring-pour" onClick={(e) => void log(pourVessel.ml, pourVessel, e.detail)}>
            {total >= profile.goalMl ? 'Log' : 'Pour'} {fmt(pourVessel.ml)}
          </button>
        )}
      </div>
    </main>
  );
}
