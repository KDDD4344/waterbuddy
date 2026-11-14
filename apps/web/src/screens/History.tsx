import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrinkLog, type Profile } from '../data/db';
import { goalOn, logsForDay, removeLog, restoreLog, totalsForDays, updateLog } from '../data/repo';
import { dayKey, dayLabel, lastNDays, timeLabel, type DayKey } from '../domain/dates';
import { progress } from '../domain/progress';
import { formatAmount } from '../domain/units';
import { useToday } from '../hooks/useToday';
import { useToast } from '../ui/toast';
import { EditLogSheet } from './LogSheets';

const DAYS = 14;

/** Drink history. Embedded at the bottom of the Journal; it has its own heading there. */
export function History({ profile, embedded = false }: { profile: Profile; embedded?: boolean }) {
  const today = useToday();
  // Only days since the person started; earlier days would read as empty bottles they never had.
  const startDay = dayKey(new Date(profile.createdAt));
  const days = lastNDays(today, DAYS).filter((d) => d >= startDay);
  const totals = useLiveQuery(() => totalsForDays(days), [today]);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const [open, setOpen] = useState<DayKey | null>(null);
  const [editing, setEditing] = useState<DrinkLog | null>(null);
  const toast = useToast();
  const fmt = (ml: number) => formatAmount(ml, profile.units, profile.cupMl);

  const rows = days.map((d) => {
    const total = totals?.get(d) ?? 0;
    const goal = goalOn(d, goals ?? [], profile.goalMl);
    return { day: d, total, goal, p: progress(total, goal) };
  });
  const lastWeek = rows.slice(0, 7);
  const met = lastWeek.filter((r) => r.p.reached).length;
  const lead =
    rows.length <= 1
      ? 'Your days will collect here, one at a time.'
      : met === 0
        ? 'Every day is a fresh start.'
        : `Goal met on ${met} of the last ${lastWeek.length} days.`;

  return (
    <Wrap embedded={embedded}>
      <p className="kicker">{rows.length < DAYS ? 'Since you started' : `Last ${DAYS} days`}</p>
      {embedded ? <h2>Drink history</h2> : <h1 className="title">History</h1>}
      <p className={embedded ? undefined : 'lead'}>{lead}</p>

      <ul className="days">
        {rows.map((r) => (
          <li key={r.day} className="day">
            <button
              type="button"
              className="day-row"
              aria-expanded={open === r.day}
              onClick={() => setOpen(open === r.day ? null : r.day)}
            >
              <span className="day-name">{dayLabel(r.day, today)}</span>
              <span className="day-total">
                {fmt(r.total)} <span className="muted">of {fmt(r.goal)}</span>
              </span>
              <span className="day-bar" aria-hidden="true">
                <span style={{ width: `${r.p.percent}%` }} data-full={r.p.reached} />
              </span>
              {r.p.reached && <span className="chip">Full</span>}
              <span className="sr-only">{r.p.percent} percent of that day's goal.</span>
            </button>
            {open === r.day && <DayEntries day={r.day} profile={profile} onEdit={setEditing} />}
          </li>
        ))}
      </ul>

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
    </Wrap>
  );
}

function Wrap({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <div className="history">{children}</div> : <main className="screen history">{children}</main>;
}

function DayEntries({ day, profile, onEdit }: { day: DayKey; profile: Profile; onEdit: (l: DrinkLog) => void }) {
  const logs = useLiveQuery(() => logsForDay(day), [day]);
  if (!logs) return null;
  if (logs.length === 0) return <p className="muted day-empty">No drinks logged.</p>;
  return (
    <ul className="day-entries">
      {logs.map((l) => (
        <li key={l.id}>
          <button type="button" className="entry" onClick={() => onEdit(l)}>
            <span className="entry-time">{timeLabel(l.at)}</span>{' '}
            <span className="entry-amount">{formatAmount(l.ml, profile.units, profile.cupMl)}</span>{' '}
            <span className="entry-edit">Edit</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
