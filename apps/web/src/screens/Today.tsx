import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrinkLog, type Profile } from '../data/db';
import { logsForDay, removeLog, restoreLog, updateLog } from '../data/repo';
import { dayLabel, timeLabel } from '../domain/dates';
import { progress, STANDARD_GLASS_ML } from '../domain/progress';
import { shouldShowSipGuard } from '../domain/guards';
import { formatAmount, formatBig, spokenAmount } from '../domain/units';
import { useToday } from '../hooks/useToday';
import { useLogDrink } from '../hooks/useLogDrink';
import { useToast } from '../ui/toast';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Pond } from '../components/Pond';
import { tipFor } from '../domain/tips';
import { CustomAmountSheet, EditLogSheet } from './LogSheets';
import { FieldTaskEntry } from './FieldTask';
import { MessageBottle, PostcardSheet } from './Postcard';
import { useNow } from '../hooks/useNow';
import { clockLabel, isAfterLastCall, lastCallTime, scenePhase } from '../domain/voyage';


const STAMP_WORDS: Record<number, string> = { 25: 'Underway', 50: 'Halfway', 75: 'Nearly there', 100: 'Goal reached' };

export function Today({ profile }: { profile: Profile }) {
  const today = useToday();
  const logs = useLiveQuery(() => logsForDay(today), [today]);
  const vessels = useLiveQuery(() => db.vessels.orderBy('order').toArray(), []);
  const toast = useToast();
  const [customOpen, setCustomOpen] = useState(false);
  const [editing, setEditing] = useState<DrinkLog | null>(null);
  const [stamp, setStamp] = useState<{ pct: number; key: number } | null>(null);
  const [guardDismissedAt, setGuardDismissedAt] = useState(0);
  const reducedMotion = useReducedMotion(profile.reduceMotion);
  const now = useNow();
  const waiting = useLiveQuery(() => db.postcards.filter((r) => !r.readAt).sortBy('day'), []);
  const [postcard, setPostcard] = useState<string | null>(null);

  const list = logs ?? [];
  const total = list.reduce((s, l) => s + l.ml, 0);
  // "Glasses to go" always means a standard 250 ml glass, so it reads the same whatever vessels someone uses.
  const p = progress(total, profile.goalMl, STANDARD_GLASS_ML);
  const big = formatBig(total, profile.units, profile.cupMl);
  const fmt = (ml: number) => formatAmount(ml, profile.units, profile.cupMl);
  const showGuard = shouldShowSipGuard(list, new Date()) && Date.now() - guardDismissedAt > 60 * 60 * 1000;

  const log = useLogDrink(profile, (pct) => setStamp({ pct, key: Date.now() }));

  const lastCalled = isAfterLastCall(now, profile.bedtime);
  const phase = scenePhase(now, { goalMet: p.reached, messageWaiting: (waiting?.length ?? 0) > 0, bedtime: profile.bedtime });
  // After last call Pip stops counting down, so the app never nudges anyone to drink late (safety rule 3).
  const remaining = Math.max(0, profile.goalMl - total);
  const subline = p.reached
    ? `Goal reached · ${p.percent}% · Ripple sets off tonight and will send a postcard.`
    : lastCalled
      ? `of ${fmt(profile.goalMl)} · ${p.percent}% · last call was ${clockLabel(lastCallTime(profile.bedtime))}. More tomorrow.`
      : `of ${fmt(profile.goalMl)} · ${p.percent}% · ${fmt(remaining)} to go`;

  return (
    <main className="screen today">
      <div className="stage" data-phase={phase}>
        <Pond variant="today" want3d={profile.scene3d !== false} progress={p.fill} explore={false} reduced={reducedMotion} sound={profile.sound === true}>
          <p className="sr-only">{`Ripple's spring is ${p.percent} percent full.${p.reached ? ' It is full for today.' : ''}`}</p>
        </Pond>
        <div className="stage-top">
          <p className="kicker">{dayLabel(today, today)} · fluids logged</p>
          <section className="stat" aria-label="Today's progress">
            <p className="big" aria-hidden="true">
              <span className="big-value">{big.value}</span>
              <span className="big-unit">{big.unit}</span>
            </p>
            <p className="sr-only">
              {spokenAmount(total, profile.units, profile.cupMl)} of {spokenAmount(profile.goalMl, profile.units, profile.cupMl)}, {p.percent} percent.
            </p>
            <p className="subline" aria-hidden="true">
              {subline}
            </p>
            {stamp && (
              <div key={stamp.key} className="stamp" aria-hidden="true" onAnimationEnd={() => setStamp(null)}>
                <b>{stamp.pct}%</b>
                <span>{STAMP_WORDS[stamp.pct]}</span>
              </div>
            )}
          </section>
        </div>
        {waiting && waiting.length > 0 && <MessageBottle count={waiting.length} onOpen={() => setPostcard(waiting[0]!.id)} />}
      </div>
      <div className="meter" role="progressbar" aria-label="Today's goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent}>
        <div className="meter-fill" style={{ width: `${p.percent}%` }} />
      </div>

      <section aria-label="Log a drink" className="log-grid">
        {(vessels ?? []).map((v) => (
          <button key={v.id} type="button" className="log-btn" onClick={(e) => log(v.ml, v, e.detail)} aria-label={`Log ${fmt(v.ml)}, ${v.name}`}>
            <span className="log-amount">+ {fmt(v.ml)}</span>{' '}
            <span className="log-name">{v.name}</span>
          </button>
        ))}
        <button type="button" className="log-btn other" onClick={() => setCustomOpen(true)}>
          <span className="log-amount">Other</span>
          <span className="log-name">Custom amount</span>
        </button>
      </section>

      <FieldTaskEntry variant="chip" />

      <aside className="tip" aria-label="Tip of the day">
        <p className="label">Field note</p>
        <p>{tipFor(today)}</p>
      </aside>

      {showGuard && (
        <div className="note calm" role="status">
          <p className="label">Sip, don&rsquo;t rush</p>
          <p>That&rsquo;s over a litre in the last hour. Your body handles water best a little at a time, so there&rsquo;s no hurry.</p>
          <button type="button" className="btn ghost" onClick={() => setGuardDismissedAt(Date.now())}>
            Got it
          </button>
        </div>
      )}


      <section className="entries" aria-labelledby="entries-title">
        <h2 id="entries-title">Today&rsquo;s drinks</h2>
        {list.length === 0 ? (
          <p className="muted">Nothing logged yet today.</p>
        ) : (
          <ul>
            {[...list].reverse().map((l) => {
              const v = vessels?.find((x) => x.id === l.vesselId);
              return (
                <li key={l.id}>
                  <button type="button" className="entry" onClick={() => setEditing(l)}>
                    <span className="entry-time">{timeLabel(l.at)}</span>{' '}
                    <span className="entry-amount">{fmt(l.ml)}</span>{' '}
                    <span className="entry-name">{v?.name ?? 'Custom'}</span>
                    {' '}
                    <span className="entry-edit">Edit</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PostcardSheet id={postcard} onClose={() => setPostcard(null)} />
      <CustomAmountSheet open={customOpen} onClose={() => setCustomOpen(false)} onLog={(ml) => log(ml)} units={profile.units} cupMl={profile.cupMl} />
      <EditLogSheet
        log={editing}
        units={profile.units}
        cupMl={profile.cupMl}
        onClose={() => setEditing(null)}
        onSave={async (ml, at) => {
          if (!editing) return;
          await updateLog(editing.id, { ml, at });
          setEditing(null);
          toast({ text: 'Drink updated.' });
        }}
        onDelete={async () => {
          if (!editing) return;
          const id = editing.id;
          await removeLog(id);
          setEditing(null);
          toast({ text: 'Drink deleted.', action: { label: 'Undo', run: () => void restoreLog(id) } });
        }}
      />
    </main>
  );
}
