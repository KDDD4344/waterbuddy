import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Profile } from '../data/db';
import { updateProfile } from '../data/repo';
import { atlasState, HARBOUR, ISLANDS, statusLine, type AtlasState, type IslandStatus } from '../domain/atlas';
import { ROUTE_NAME } from '../domain/voyage';
import { canUseWebGL } from '../three/webgl';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { PostcardSheet } from './Postcard';

const WaterverseCanvas = lazy(() => import('../three/WaterverseCanvas'));

/**
 * The Waterverse. Each postcard lifts the fog from its island for good. The 3D map is a
 * bonus: the list below reaches every place by keyboard and screen reader, and is all
 * there is when 3D is off (decision D-003).
 */
export function Atlas({ profile }: { profile: Profile }) {
  const records = useLiveQuery(() => db.postcards.toArray(), []);
  const reducedMotion = useReducedMotion(profile.reduceMotion);
  const use3d = profile.scene3d !== false && canUseWebGL();
  // The voyage to play is fixed when the screen opens, so it plays once.
  const [plan, setPlan] = useState<AtlasState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const labels = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!records || plan) return;
    const p = atlasState(new Set(records.map((r) => r.id)), profile.atlasSeen ?? 0);
    setPlan(p);
    // Without the 3D voyage there is nothing to watch, so new islands count as seen now.
    if (!use3d && p.arrivals.length) void updateProfile({ atlasSeen: p.clearCount });
  }, [records, plan, profile.atlasSeen, use3d]);

  if (!plan) return <main className="screen atlas" aria-busy="true" />;

  // Live status for the list and labels: arriving islands are already out of the fog.
  const live = atlasState(new Set((records ?? []).map((r) => r.id)), Number.MAX_SAFE_INTEGER);
  const status = live.status;
  const chosen = selected === null ? null : ISLANDS[selected];

  return (
    <main className="screen atlas">
      <div className="atlas-stage">
        <AtlasChart status={status} hidden={use3d && ready} />
        {use3d && (
          <Suspense fallback={null}>
            <div className={`atlas-3d${ready ? ' ready' : ''}`}>
              <WaterverseCanvas
                status={plan.status}
                from={plan.from}
                arrivals={plan.arrivals}
                selected={selected}
                onSelect={setSelected}
                onArrive={(i) => void updateProfile({ atlasSeen: Math.max(profile.atlasSeen ?? 0, i + 1) })}
                reducedMotion={reducedMotion}
                soundOn={profile.sound === true}
                onReady={() => setReady(true)}
                labels={labels}
              />
            </div>
            <div className="atlas-labels" aria-hidden="true">
              {ISLANDS.map((isl, i) => (
                <span
                  key={isl.card.id}
                  ref={(el) => {
                    labels.current[i] = el;
                  }}
                  className="atlas-label"
                  data-status={status[i]}
                  onClick={() => setSelected(i)}
                >
                  {status[i] === 'clear' || status[i] === 'arriving' ? isl.card.place : isl.card.number}
                </span>
              ))}
            </div>
          </Suspense>
        )}
        <div className="atlas-top">
          <p className="kicker">{ROUTE_NAME}</p>
          <h1 className="title">The Waterverse</h1>
        </div>
        {chosen && selected !== null && (
          <IslandCard index={selected} status={status[selected]!} onClose={() => setSelected(null)} onRead={() => setReading(chosen.card.id)} />
        )}
      </div>

      <section aria-labelledby="places-h" className="places">
        <h2 id="places-h">Places on Route I</h2>
        <p className="small muted">
          {live.clearCount} of {ISLANDS.length} out of the fog. Each day your bottle fills, Pip sails one island further. The fog never comes back.
        </p>
        <ol className="place-list">
          {ISLANDS.map((isl, i) => {
            const s = status[i]!;
            const open = s === 'clear' || s === 'arriving';
            return (
              <li key={isl.card.id}>
                <button type="button" className="place" data-status={s} aria-current={selected === i ? 'true' : undefined} onClick={() => setSelected(i)}>
                  <span className="place-no" aria-hidden="true">
                    {isl.card.number}
                  </span>
                  <span className="place-text">
                    <span className="place-name">{open ? isl.card.place : `Island ${isl.card.number}`}</span>
                    <span className="small muted">{open ? `${isl.card.region} · ${statusLine(s)}` : statusLine(s)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <PostcardSheet id={reading} onClose={() => setReading(null)} />
    </main>
  );
}

function IslandCard({ index, status, onClose, onRead }: { index: number; status: IslandStatus; onClose: () => void; onRead: () => void }) {
  const isl = ISLANDS[index]!;
  const open = status === 'clear' || status === 'arriving';
  return (
    <section className="island-card" aria-live="polite" aria-label={open ? isl.card.place : `Island ${isl.card.number}`}>
      <div className="island-card-head">
        <p className="kicker">
          Island {isl.card.number} · {statusLine(status)}
        </p>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {open ? (
        <>
          <h2>{isl.card.place}</h2>
          <p className="small">
            <b>Field find:</b> {isl.card.fieldFind.name}. {isl.card.fieldFind.note}
          </p>
          <button type="button" className="btn primary" onClick={onRead}>
            Read the postcard
          </button>
        </>
      ) : (
        <p>{status === 'next' ? 'Pip sails here the morning after a day your bottle fills.' : 'Further along the route, past the next island.'}</p>
      )}
    </section>
  );
}

/** A flat chart of the route: shown while the 3D loads, and instead of it when 3D is off. */
function AtlasChart({ status, hidden }: { status: IslandStatus[]; hidden: boolean }) {
  const X = (x: number) => ((x + 22) / 46) * 320;
  const Y = (z: number) => ((z + 25) / 45) * 300;
  const pts = [HARBOUR, ...ISLANDS];
  return (
    <svg className={`atlas-chart${hidden ? ' hidden-under' : ''}`} viewBox="0 0 320 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="320" height="300" fill="#6FB7B0" />
      <path
        d={pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.z).toFixed(1)}`).join(' ')}
        stroke="#FBF7EC"
        strokeWidth="2"
        strokeDasharray="2 6"
        strokeLinecap="round"
        fill="none"
      />
      {ISLANDS.map((isl, i) => {
        const open = status[i] === 'clear' || status[i] === 'arriving';
        return (
          <g key={isl.card.id} transform={`translate(${X(isl.x)} ${Y(isl.z)})`}>
            <circle r={isl.radius * 5 + 6} fill={open ? '#E3CF9F' : '#B9C3C2'} />
            <circle r={isl.radius * 3.6} fill={open ? '#6FA35A' : '#A3ACAB'} />
            {!open && <circle r={isl.radius * 6 + 6} fill="#F2F5F4" opacity="0.7" />}
            <text y="4" textAnchor="middle" fontSize="12" fontWeight="700" fill="#13303A">
              {isl.card.number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
