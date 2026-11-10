import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrinkLog, type Profile, type Vessel } from '../data/db';
import { addLog, logsForDay, removeLog, restoreLog, updateLog } from '../data/repo';
import { dayLabel, timeLabel } from '../domain/dates';
import { crossedMilestone, progress, STANDARD_GLASS_ML } from '../domain/progress';
import { shouldShowSipGuard } from '../domain/guards';
import { formatAmount, formatBig, spokenAmount } from '../domain/units';
import { useToday } from '../hooks/useToday';
import { useToast } from '../ui/toast';
import { tidepoolBus } from '../three/bus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Stage } from './Stage';
import { CustomAmountSheet, EditLogSheet } from './LogSheets';
import { FieldTaskEntry } from './FieldTask';
import { MessageBottle, PostcardSheet } from './Postcard';
import { useNow } from '../hooks/useNow';
import { clockLabel, isAfterLastCall, lastCallTime, scenePhase, type Phase } from '../domain/voyage';

const NIGHT: Record<Phase, number> = { day: 0, evening: 0.3, night: 1, morning: 0 };

const STAMP_WORDS: Record<number, string> = { 25: 'Underway', 50: 'Halfway', 75: 'Nearly there', 100: 'Bottle full' };

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

  const log = async (ml: number, vessel?: Vessel) => {
    const before = total;
    const after = before + ml;
    const milestone = before < profile.goalMl ? crossedMilestone(before, after, profile.goalMl) : null;
    // Start the pour animation straight away; storage catches up a few milliseconds later.
    tidepoolBus.emit({
      type: 'pour',
      event: {
        ml,
        fromFill: Math.min(1, before / profile.goalMl),
        toFill: Math.min(1, after / profile.goalMl),
        milestone,
        overGoal: before >= profile.goalMl
      }
    });
    const entry = await addLog(ml, vessel?.id ?? null);
    if (milestone) setStamp({ pct: milestone, key: Date.now() });
    const status =
      before >= profile.goalMl
        ? `${fmt(ml)} logged. Today's goal was already met.`
        : after >= profile.goalMl
          ? `${fmt(ml)} logged. Goal reached for today.`
          : `${fmt(ml)} logged. ${fmt(after)} of ${fmt(profile.goalMl)}.`;
    toast({
      text: status,
      action: {
        label: 'Undo',
        run: () => {
          tidepoolBus.emit({ type: 'undo', toFill: Math.min(1, before / profile.goalMl) });
          void removeLog(entry.id);
        }
      }
    });
  };

  const lastCalled = isAfterLastCall(now, profile.bedtime);
  const phase = scenePhase(now, { goalMet: p.reached, messageWaiting: (waiting?.length ?? 0) > 0, bedtime: profile.bedtime });
  // After last call Pip stops counting down, so the app never nudges anyone to drink late (safety rule 3).
  const subline = p.reached
    ? 'Bottle full and corked. Pip sets sail tonight.'
    : lastCalled
      ? `of ${fmt(profile.goalMl)} · last call was ${clockLabel(lastCallTime(profile.bedtime))}. We’ll sail tomorrow.`
      : `of ${fmt(profile.goalMl)} · about ${p.glassesToGo} ${p.glassesToGo === 1 ? 'glass' : 'glasses'} to go`;

  return (
    <main className="screen today">
      <div className="stage" data-phase={phase}>
        <Stage
          fill={p.fill}
          corked={p.reached}
          night={NIGHT[phase]}
          label={`Pip's bottle is ${p.percent} percent full.${p.reached ? ' It is full for today.' : ''}`}
          want3d={profile.scene3d !== false}
          reducedMotion={reducedMotion}
          soundOn={profile.sound === true}
        />
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

      <FieldTaskEntry variant="chip" />

      {showGuard && (
        <div className="note calm" role="status">
          <p className="label">Sip, don&rsquo;t rush</p>
          <p>That&rsquo;s over a litre in the last hour. Your body handles water best a little at a time, so there&rsquo;s no hurry.</p>
          <button type="button" className="btn ghost" onClick={() => setGuardDismissedAt(Date.now())}>
            Got it
          </button>
        </div>
      )}

      <section aria-label="Log a drink" className="log-grid">
        {(vessels ?? []).map((v) => (
          <button key={v.id} type="button" className="log-btn" onClick={() => log(v.ml, v)} aria-label={`Log ${fmt(v.ml)}, ${v.name}`}>
            <span className="log-amount">+ {fmt(v.ml)}</span>{' '}
            <span className="log-name">{v.name}</span>
          </button>
        ))}
        <button type="button" className="log-btn other" onClick={() => setCustomOpen(true)}>
          <span className="log-amount">Other</span>
          <span className="log-name">Custom amount</span>
        </button>
      </section>

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
