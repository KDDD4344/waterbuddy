/**
 * Hero Experience Lab: Ripple in Spring Hollow, and the 250 ml pour.
 * The scene is plain three.js driven by engine/scene.ts; this component is the HTML layer
 * (every action is a real button, so it all works by keyboard and screen reader too).
 *
 * Two layers of interface:
 *  - the CONSUMER layer: today's progress, the pour button (with Undo for a mis-tap), a short
 *    first-visit guide (reopened from the menu) and comfort settings (motion, sound);
 *  - LAB TOOLS for the team: reaction triggers, reset, the GLB download, render info. They show
 *    in the dev server, and in a production build only with ?dev. Visibly marked so nobody
 *    mistakes them for product UI.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { HeroScene, type Interactive, type PourPlan } from './engine/scene';
import {
  drunk,
  formatMl,
  GLASS_ML,
  logGlass,
  entryKey,
  mergeDays,
  restoreDay,
  sameDay,
  localDate,
  removeEntry,
  serializeDay,
  startingDay,
  type Day,
  type LogEntry
} from './engine/hydration';
import type { Reaction } from './engine/animator';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { canUseWebGL } from '../three/webgl';
import { perfRequested } from '../lib/perf';
import { PerfMeter } from '../ui/PerfMeter';

/**
 * Testers can force a tier on real phones: /lab/?dev&q=low or ?dev&q=high, and ?dev&dpr=1.
 * Only read when the lab tools are allowed (dev builds, or ?dev), never on the consumer page.
 */
function overrides(): { quality?: 'high' | 'low'; maxDpr?: number; buddyLite?: boolean } {
  try {
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q');
    const d = Number(p.get('dpr'));
    // ?buddyLite=0 keeps Ripple's transmission on the low tier (for measuring its cost).
    const lite = p.get('buddyLite');
    return {
      quality: q === 'low' || q === 'high' ? q : undefined,
      maxDpr: d > 0 && d <= 3 ? d : undefined,
      buddyLite: lite === null ? undefined : lite !== '0'
    };
  } catch {
    return {};
  }
}

function labToolsAllowed(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('dev');
  } catch {
    return false;
  }
}

/** Today's drinks live on this device only (the lab has no account or server). */
const DAY_KEY = 'wb-lab-day';
const GUIDE_KEY = 'wb-lab-guide-done';
/** How many visits the guide has opened by itself on; it stops after two. */
const GUIDE_SEEN_KEY = 'wb-lab-guide-seen';
function loadDay(now = new Date()): Day {
  try {
    return restoreDay(localStorage.getItem(DAY_KEY), now) ?? startingDay(undefined, undefined, now);
  } catch {
    return startingDay(undefined, undefined, now);
  }
}
let guideCounted = false;
function guideDue(): boolean {
  if (storeGet(GUIDE_KEY) !== null) return false;
  return Number(storeGet(GUIDE_SEEN_KEY) ?? 0) < 2;
}
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
    // Private mode or storage full: the lab still works, it just won't remember.
  }
}
/** How long Undo stays offered after a glass lands. */
const UNDO_SECONDS = 10;
const TOUCHABLE: Interactive[] = ['ripple', 'water', 'pad', 'spout'];

export default function HeroLab() {
  const webgl = canUseWebGL();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HeroScene | null>(null);
  const [day, setDay] = useState<Day>(() => loadDay());
  // The calendar day `day` belongs to. A page left open past midnight starts a new one.
  const dayDate = useRef(localDate(new Date()));
  // Set when `day` was just read from storage (another tab), so it isn't written straight back.
  const fromStorage = useRef(false);
  // The glass the Undo button is offered for: exactly that entry, never "whatever is last".
  const undoEntry = useRef<LogEntry | null>(null);
  const [shownMl, setShownMl] = useState(() => drunk(day));
  // Undo for the last glass: offered for a few seconds after it lands.
  const [undoable, setUndoable] = useState(false);
  // First-visit guide: shown until "Got it"; the menu brings it back.
  const [guide, setGuide] = useState(guideDue);
  const [tried, setTried] = useState<ReadonlySet<Interactive>>(() => new Set());
  const [pouring, setPouring] = useState(false);
  const [pourFill, setPourFill] = useState(0);
  const [chip, setChip] = useState(0);
  const [status, setStatus] = useState('');
  const [guard, setGuard] = useState(false);
  // Like the app: once dismissed, the sip-guard note stays away for an hour.
  const guardDismissedAt = useRef(-Infinity);
  const [motionPref, setMotionPref] = useState<boolean | undefined>(undefined);
  const reduced = useReducedMotion(motionPref);
  const [sound, setSound] = useState(false);
  const [lost, setLost] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tools] = useState(labToolsAllowed);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [render, setRender] = useState('');
  const [buddyState, setBuddyState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [asset, setAsset] = useState('');
  const [frameStats, setFrameStats] = useState('');
  // Frame-time meter: lab tools only (/lab/?dev&perf on a real phone).
  const [perf] = useState(() => tools && perfRequested());
  const dayRef = useRef(day);
  dayRef.current = day;
  const pourSpan = useRef<[number, number]>([0, 1]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webgl) return;
    const scene = new HeroScene(canvas, {
      ...(tools ? overrides() : {}),
      reduced,
      buddy: 'sprite',
      progress: Math.min(1, drunk(dayRef.current) / dayRef.current.goal),
      callbacks: {
        onDisplayMl: (ml) => {
          setShownMl(ml);
          const [a, b] = pourSpan.current;
          setPourFill(Math.max(0, Math.min(1, (ml - a) / Math.max(1, b - a))));
        },
        onPourDone: (plan: PourPlan) => {
          setPouring(false);
          setPourFill(0);
          setUndoable(true);
          // The true total (another tab may have logged while this glass poured).
          setShownMl(drunk(dayRef.current));
          // Screen-reader users hear that Undo is there (it's just before the Pour button).
          const undoNote = ' Undo is available just before the Pour button.';
          if (plan.reachedGoal)
            setStatus(`${formatMl(plan.toMl)}. That's today's goal, and Ripple is celebrating.${undoNote}`);
          else if (plan.pastGoal)
            setStatus(
              `Logged ${formatMl(GLASS_ML)}; ${formatMl(plan.toMl)} today. Today's goal is already met, so there's no need for more unless you're thirsty.${undoNote}`
            );
          else setStatus(`Poured ${formatMl(GLASS_ML)}. ${formatMl(plan.toMl)} of ${formatMl(plan.goal)}.${undoNote}`);
        },
        onQuality: (q) => setRender(`${q.quality} quality · ${q.dpr.toFixed(2)}× resolution`),
        onReaction: () => {},
        onInteract: (what) => setTried((t) => (t.has(what) ? t : new Set(t).add(what))),
        onContextLost: () => setLost(true),
        onBuddyState: (st) => {
          setBuddyState(st);
          if (st === 'error') setStatus('Ripple couldn’t load. Logging still works.');
        }
      }
    });
    sceneRef.current = scene;
    // Test and measurement hooks (frozen, advance, adaptive, buddyInfo) are reachable only from
    // here, so the consumer page exposes none of them.
    const w = window as unknown as { __heroLab?: HeroScene };
    if (tools) {
      w.__heroLab = scene;
      document.title = 'WaterBuddy · Hero Lab';
    }
    return () => {
      if (w.__heroLab === scene) delete w.__heroLab;
      scene.dispose();
      sceneRef.current = null;
    };
    // The scene is created once; later changes are pushed to it by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl]);

  // Every change to the day is saved at once, so a reload or a closed tab never loses a glass.
  // It's merged with what's stored first: another tab may have saved a glass a moment ago, and
  // saving this tab's copy over it would lose that glass.
  useEffect(() => {
    if (fromStorage.current) {
      fromStorage.current = false;
      return;
    }
    const stored = restoreDay(storeGet(DAY_KEY), dayDate.current);
    const merged = stored ? mergeDays(day, stored) : day;
    storeSet(DAY_KEY, serializeDay(merged, dayDate.current));
    if (!sameDay(merged, day)) {
      fromStorage.current = true;
      dayRef.current = merged;
      adoptDay(merged, '');
    }
  }, [day]);

  /** Show a day that came from elsewhere (another tab, or a new calendar day). */
  const adoptDay = (d: Day, why: string) => {
    setDay(d);
    // Undo stays offered while its glass is still there (a merge only adds the other tab's).
    const u = undoEntry.current;
    if (!u || !d.logs.some((l) => entryKey(l) === entryKey(u))) {
      setUndoable(false);
      undoEntry.current = null;
    }
    if (!sceneRef.current?.pouring) {
      setShownMl(drunk(d));
      sceneRef.current?.setProgress(Math.min(1, drunk(d) / d.goal), true);
    }
    if (why) setStatus(why);
  };

  // A new day at midnight, even if the page stays open (checked every 30 s and on return).
  const rollOver = (now = new Date()) => {
    const today = localDate(now);
    if (today === dayDate.current) return false;
    dayDate.current = today;
    const d = loadDay(now);
    dayRef.current = d;
    adoptDay(d, `A new day. ${formatMl(drunk(d))} so far today.`);
    return true;
  };
  useEffect(() => {
    const check = () => {
      if (!sceneRef.current?.pouring) rollOver();
    };
    const id = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Two tabs open: each one picks up the other's glasses instead of overwriting them.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DAY_KEY || e.newValue === null) return;
      const incoming = restoreDay(e.newValue, dayDate.current);
      if (!incoming) return;
      // Merge, never replace: if both tabs saved at the same moment, the other tab's save may
      // be missing this tab's glass, so the merged day is written back and both converge.
      const merged = mergeDays(dayRef.current, incoming);
      if (!sameDay(merged, incoming)) storeSet(DAY_KEY, serializeDay(merged, dayDate.current));
      if (!sameDay(merged, dayRef.current)) {
        fromStorage.current = true;
        dayRef.current = merged;
        adoptDay(merged, '');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // The guide counts the visits it opened on by itself, and retires once someone has both
  // looked around and touched something (they've got it, even without pressing Got it).
  useEffect(() => {
    // Once per page load (React's dev mode runs effects twice).
    if (guideCounted || !guideDue()) return;
    guideCounted = true;
    storeSet(GUIDE_SEEN_KEY, String(Number(storeGet(GUIDE_SEEN_KEY) ?? 0) + 1));
  }, []);
  const explored = (tried.has('look') || tried.has('zoom')) && TOUCHABLE.some((k) => tried.has(k));
  useEffect(() => {
    if (explored) storeSet(GUIDE_KEY, '1');
  }, [explored]);

  // Undo is a short window after each glass, not a permanent button. The countdown pauses
  // while Undo has keyboard focus or a pointer over it (no one loses it mid-reach), and starts
  // again when they move away.
  const [undoHeld, setUndoHeld] = useState(false);
  useEffect(() => {
    if (!undoable || undoHeld) return;
    const id = window.setTimeout(() => setUndoable(false), UNDO_SECONDS * 1000);
    return () => window.clearTimeout(id);
  }, [undoable, undoHeld]);
  const pourRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => sceneRef.current?.setReduced(reduced), [reduced]);
  useEffect(() => sceneRef.current?.setSound(sound), [sound]);

  // On phones the controls sit over the bottom of the scene; tell the camera how much.
  const dockRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const covers = getComputedStyle(dock).backgroundColor !== 'rgba(0, 0, 0, 0)';
      const h = covers ? dock.getBoundingClientRect().height : 0;
      document.documentElement.style.setProperty('--dock-h', `${h}px`);
      sceneRef.current?.setInsetBottom(h);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(dock);
    measure();
    return () => ro.disconnect();
  }, []);

  const total = drunk(day);
  const met = total >= day.goal;

  const pour = () => {
    const s = sceneRef.current;
    if (!s || s.pouring) return;
    const now = new Date();
    rollOver(now);
    const out = logGlass(dayRef.current, now);
    pourSpan.current = [out.before, out.after];
    const ok = s.logGlass({
      fromMl: out.before,
      toMl: out.after,
      goal: out.day.goal,
      reachedGoal: out.reachedGoal,
      pastGoal: out.pastGoal
    });
    if (!ok) return;
    dayRef.current = out.day;
    undoEntry.current = out.day.logs[out.day.logs.length - 1]!;
    setDay(out.day);
    setPouring(true);
    setUndoable(false);
    setUndoHeld(false);
    setChip((c) => c + 1);
    setStatus(`${out.pastGoal ? 'Logging' : 'Pouring'} ${formatMl(GLASS_ML)}…`);
    if (out.rushing && Date.now() - guardDismissedAt.current > 60 * 60 * 1000) setGuard(true);
  };

  const undo = () => {
    const entry = undoEntry.current;
    if (pouring || !entry) return;
    const out = removeEntry(dayRef.current, entry);
    undoEntry.current = null;
    setUndoable(false);
    if (!out.removed) return;
    dayRef.current = out.day;
    setDay(out.day);
    const total = drunk(out.day);
    setShownMl(total);
    // The spring settles back down rather than jumping.
    sceneRef.current?.setProgress(Math.min(1, total / out.day.goal), true);
    setGuard(false);
    setStatus(`Undone. ${formatMl(total)} of ${formatMl(out.day.goal)} today.`);
    // Undo disappears; keep keyboard focus nearby instead of losing it to the page.
    setUndoHeld(false);
    pourRef.current?.focus();
  };

  const closeGuide = () => {
    setGuide(false);
    storeSet(GUIDE_KEY, '1');
  };

  const react = (k: Reaction) => {
    sceneRef.current?.react(k);
  };

  const reset = () => {
    const d = startingDay();
    dayDate.current = localDate(new Date());
    undoEntry.current = null;
    dayRef.current = d;
    setDay(d);
    setShownMl(drunk(d));
    setGuard(false);
    setUndoable(false);
    sceneRef.current?.setProgress(Math.min(1, drunk(d) / d.goal));
    setStatus(`Day reset to ${formatMl(drunk(d))}.`);
  };

  // Lab tools: show the asset's stats and the clip now playing, refreshed while open.
  useEffect(() => {
    if (!toolsOpen) return;
    const tick = () => {
      const fs = sceneRef.current?.stats;
      if (fs && fs.frameMs > 0)
        setFrameStats(
          `${fs.fps} fps · frame ${fs.frameMs} ms (p90 ${fs.p90Ms}) · page work ${fs.workMs} ms · ${fs.calls} draw calls · ${Math.round(fs.triangles / 1000)}k triangles per frame`
        );
      const info = sceneRef.current?.buddyInfo;
      if (!info) return;
      if (info.state !== 'ready' || !info.stats) {
        setAsset(info.state === 'error' ? `Asset failed: ${info.error ?? 'unknown error'}` : 'Loading Ripple’s GLB…');
        return;
      }
      const st = info.stats;
      setAsset(
        `${st.file} · ${(st.bytes / 1e6).toFixed(2)} MB · ${Math.round(st.triangles / 100) / 10}k triangles · ${st.meshes} meshes · ${st.bones} bones · loaded in ${st.loadMs} ms · clips: ${st.clips.map((c) => `${c.name} ${c.seconds.toFixed(1)}s`).join(', ')} · playing: ${info.playing ?? 'idle'}`
      );
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [toolsOpen]);

  const onStageKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = sceneRef.current;
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
      setTried((t) => (t.has('look') ? t : new Set(t).add('look')));
    }
  };

  const pct = Math.min(100, (shownMl / day.goal) * 100);
  // After the goal, logging stays accurate but nothing about the button invites more.
  const pourLabel = pouring
    ? met && pourSpan.current[0] >= day.goal
      ? 'Logging…'
      : 'Pouring…'
    : met
      ? `Log ${GLASS_ML} ml`
      : `Pour ${GLASS_ML} ml`;

  return (
    <div className="lab" data-reduced={reduced || undefined}>
      <div
        className="lab-stage"
        tabIndex={0}
        role="application"
        aria-roledescription="3D scene"
        aria-label="Spring Hollow, with Ripple. Arrow keys look around; plus and minus zoom."
        onKeyDown={onStageKey}
      >
        {webgl && !lost ? (
          <canvas ref={canvasRef} className="lab-canvas" aria-hidden="true" />
        ) : (
          <div className="lab-fallback">
            <p className="lab-kicker">Hero Lab</p>
            <p>
              {lost
                ? 'The graphics context was lost. Reload the page to bring the spring back.'
                : 'This lab needs WebGL, which this browser has turned off.'}
            </p>
          </div>
        )}
      </div>

      <header className="lab-top">
        <div className="lab-brand">
          <span className="lab-word">WaterBuddy</span>
        </div>
        <div className="lab-progress" aria-label="Today" data-met={met || undefined}>
          <p className="lab-ml">
            <span className="lab-num">{shownMl.toLocaleString('en-IN')}</span>
            <span className="lab-of"> / {formatMl(day.goal)}</span>
            {chip > 0 && (
              <span key={chip} className="lab-chip" aria-hidden="true">
                +{GLASS_ML}
              </span>
            )}
          </p>
          <div className="lab-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
          <p className="lab-sub">
            {met ? 'Goal met for today' : `${Math.ceil((day.goal - total) / GLASS_ML)} glasses to go`}
          </p>
        </div>
        <div
          className="lab-menu"
          onKeyDown={(e) => {
            // Escape closes the menu and returns focus to its button.
            if (e.key === 'Escape' && menu) {
              setMenu(false);
              menuBtnRef.current?.focus();
            }
          }}
        >
          <button
            ref={menuBtnRef}
            type="button"
            className="lab-iconbtn"
            aria-expanded={menu}
            aria-controls="lab-settings"
            onClick={() => setMenu((m) => !m)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="sr-only">Settings</span>
          </button>
          {menu && (
            <div id="lab-settings" className="lab-pop">
              <label className="lab-switch">
                <input type="checkbox" checked={reduced} onChange={(e) => setMotionPref(e.target.checked)} />
                <span>Reduce motion</span>
              </label>
              <label className="lab-switch">
                <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
                <span>Sound</span>
              </label>
              <button
                type="button"
                className="lab-text-btn"
                onClick={() => {
                  setGuide(true);
                  setMenu(false);
                }}
              >
                How to explore
              </button>
            </div>
          )}
        </div>
      </header>

      {guide && (
        <section
          className="lab-coach"
          aria-labelledby="lab-coach-title"
          onKeyDown={(e) => e.key === 'Escape' && closeGuide()}
        >
          <p id="lab-coach-title" className="lab-kicker">
            Explore the spring
          </p>
          <ul>
            <li data-done={tried.has('look') || tried.has('zoom') || undefined}>
              <span className="lab-coach-mark" aria-hidden="true" />
              <span className="lab-coach-text">Drag to look around; pinch or scroll to come closer.</span>
            </li>
            <li data-done={TOUCHABLE.some((k) => tried.has(k)) || undefined}>
              <span className="lab-coach-mark" aria-hidden="true" />
              <span className="lab-coach-text">
                Tap Ripple, the water, a lily pad or the spout.
                {TOUCHABLE.some((k) => tried.has(k)) && (
                  <span className="lab-coach-count"> {TOUCHABLE.filter((k) => tried.has(k)).length} of 4 found</span>
                )}
              </span>
            </li>
            <li>
              <span className="lab-coach-mark lab-coach-mark-info" aria-hidden="true" />
              <span className="lab-coach-text">Only the Pour button logs water.</span>
            </li>
          </ul>
          <button type="button" className="lab-text-btn" onClick={closeGuide}>
            Got it
          </button>
        </section>
      )}

      {tools && (
        <aside className="lab-tools" aria-label="Lab tools (development only)" data-open={toolsOpen || undefined}>
          <button
            type="button"
            className="lab-tools-toggle"
            aria-expanded={toolsOpen}
            aria-controls="lab-tools-body"
            onClick={() => setToolsOpen((o) => !o)}
          >
            <span className="lab-dev-tag">DEV</span> Lab tools
          </button>
          {toolsOpen && (
            <div id="lab-tools-body" className="lab-tools-body">
              <p className="lab-tools-note">
                <strong>Ripple</strong> plays from a compressed copy of <code>ripple-waterbuddy.glb</code>, falling back
                to the original file (idle loops; reactions cross-fade in and out).
              </p>
              <div className="lab-tools-row" role="group" aria-label="Play a clip from the GLB">
                <button type="button" onClick={() => react('happy')}>
                  Happy
                </button>
                <button type="button" onClick={() => react('curious')}>
                  Curious
                </button>
                <button type="button" onClick={() => react('celebrate')}>
                  Celebrate
                </button>
              </div>
              <div className="lab-tools-row">
                <button type="button" onClick={reset}>
                  Reset the day
                </button>
              </div>
              {asset && <p className="lab-tools-meta">{asset}</p>}
              {render && <p className="lab-tools-meta">{render}</p>}
              {frameStats && <p className="lab-tools-meta">{frameStats}</p>}
            </div>
          )}
        </aside>
      )}

      {webgl && !lost && buddyState === 'loading' && (
        <p className="lab-arriving" role="status">
          Ripple is on the way…
        </p>
      )}
      {webgl && !lost && buddyState === 'error' && (
        <div className="lab-guard lab-error" role="alert">
          <p className="lab-kicker">Ripple couldn&rsquo;t load</p>
          <p>Check your connection. Logging water still works.</p>
          <button type="button" className="lab-text-btn" onClick={() => sceneRef.current?.retryBuddy()}>
            Try again
          </button>
        </div>
      )}

      <section ref={dockRef} className="lab-dock" aria-label="Log water">
        <div className="lab-actions">
          {undoable && !pouring && (
            <p
              className="lab-undo"
              onFocus={() => setUndoHeld(true)}
              onBlur={() => setUndoHeld(false)}
              onPointerEnter={() => setUndoHeld(true)}
              onPointerLeave={() => setUndoHeld(false)}
            >
              <span>{formatMl(GLASS_ML)} logged</span>
              <button type="button" className="lab-text-btn" onClick={undo}>
                Undo
              </button>
            </p>
          )}
          <button
            ref={pourRef}
            type="button"
            className="lab-pour"
            data-calm={met || undefined}
            onClick={pour}
            disabled={pouring || !webgl || lost}
            aria-describedby="lab-status"
            style={{ '--fill': pourFill } as CSSProperties}
          >
            <span className="lab-pour-fill" aria-hidden="true" />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 3h12l-1.6 17.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8L6 3z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path d="M7.2 11h9.6l-.8 9H8z" fill="currentColor" opacity=".85" />
            </svg>
            <span className="lab-pour-label">{pourLabel}</span>
          </button>
        </div>
      </section>

      {guard && (
        <div className="lab-guard" role="status">
          <p className="lab-kicker">Sip, don&rsquo;t rush</p>
          <p>
            That&rsquo;s over a litre in the last hour. Your body handles water best a little at a time, so
            there&rsquo;s no hurry.
          </p>
          <button
            type="button"
            className="lab-text-btn"
            onClick={() => {
              guardDismissedAt.current = Date.now();
              setGuard(false);
            }}
          >
            Got it
          </button>
        </div>
      )}

      <p id="lab-status" className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {perf && <PerfMeter />}
    </div>
  );
}
