import { useEffect, useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Profile } from '../data/db';
import { goalOn, NOTE_MAX, saveNote, totalsForDays } from '../data/repo';
import { dayKey, dayLabel, lastNDays, weekdayShort, type DayKey } from '../domain/dates';
import { progress } from '../domain/progress';
import { summarize } from '../domain/summary';
import { answerSummary, FIELD_TASKS } from '../domain/tasks';
import { formatAmount } from '../domain/units';
import { useToday } from '../hooks/useToday';
import { useToast } from '../ui/toast';
import { Sticker, stickerName } from '../components/Sticker';
import { FieldTaskEntry } from './FieldTask';
import { History } from './History';
import { PostcardAlbum } from './Postcard';

/**
 * The field journal: the week's tide marks, today's field task, stickers earned, a line a
 * day, and the full drink history underneath. Nothing here can be lost or broken.
 */
export function Journal({ profile }: { profile: Profile }) {
  return (
    <main className="screen journal">
      <header className="fold" style={{ '--i': 0 } as React.CSSProperties}>
        <p className="kicker">Field journal</p>
        <h1 className="title">Journal</h1>
      </header>
      <TideMarks profile={profile} />
      <Progress profile={profile} />
      <SpringLog />
      <section className="fold" style={{ '--i': 2 } as React.CSSProperties} aria-labelledby="task-h">
        <h2 id="task-h">Today&rsquo;s field task</h2>
        <FieldTaskEntry variant="card" />
      </section>
      <section className="fold" style={{ '--i': 3 } as React.CSSProperties} aria-labelledby="cards-h">
        <h2 id="cards-h">Postcards · Route I</h2>
        <PostcardAlbum />
      </section>
      <Stickers />
      <Notes />
      <section className="fold" style={{ '--i': 6 } as React.CSSProperties}>
        <History profile={profile} embedded />
      </section>
    </main>
  );
}

function TideMarks({ profile }: { profile: Profile }) {
  const today = useToday();
  const startDay = dayKey(new Date(profile.createdAt));
  const days = lastNDays(today, 7)
    .filter((d) => d >= startDay)
    .reverse();
  const totals = useLiveQuery(() => totalsForDays(days), [today]);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const slots: (DayKey | null)[] = [...days, ...Array<null>(7 - days.length).fill(null)];
  const fmt = (ml: number) => formatAmount(ml, profile.units, profile.cupMl);

  return (
    <section className="fold" style={{ '--i': 1 } as React.CSSProperties} aria-labelledby="tide-h">
      <h2 id="tide-h">This week&rsquo;s tide marks</h2>
      <ol className="tides">
        {slots.map((d, i) => {
          if (!d) return <li key={`empty-${i}`} className="tide future" aria-hidden="true" />;
          const total = totals?.get(d) ?? 0;
          const goal = goalOn(d, goals ?? [], profile.goalMl);
          const p = progress(total, goal);
          const label = dayLabel(d, today);
          return (
            <li key={d} className="tide" data-today={d === today} data-full={p.reached}>
              <span className="tide-tube" aria-hidden="true">
                <span className="tide-water" style={{ height: `${p.percent}%` }} />
              </span>
              <span className="tide-day" aria-hidden="true">
                {d === today ? 'Today' : weekdayShort(d)}
              </span>
              <span className="sr-only">
                {label}: {fmt(total)} of {fmt(goal)}
                {p.reached ? ', goal met' : ''}.
              </span>
            </li>
          );
        })}
      </ol>
      <p className="small muted">Each tube is one day. They never empty out or break.</p>
    </section>
  );
}

/** This week and the last 30 days, in plain numbers, plus a strip of the month. */
function Progress({ profile }: { profile: Profile }) {
  const today = useToday();
  const startDay = dayKey(new Date(profile.createdAt));
  const month = lastNDays(today, 30).filter((d) => d >= startDay);
  const week = month.slice(0, 7);
  const totals = useLiveQuery(() => totalsForDays(month), [today]);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  if (!totals || !goals) return null;
  const goalFor = (d: DayKey) => goalOn(d, goals, profile.goalMl);
  const w = summarize(week, totals, goalFor);
  const m = summarize(month, totals, goalFor);
  const fmt = (ml: number) => formatAmount(ml, profile.units, profile.cupMl);
  const strip = [...month].reverse();
  return (
    <section className="fold" style={{ '--i': 1 } as React.CSSProperties} aria-labelledby="prog-h">
      <h2 id="prog-h">Progress</h2>
      <dl className="summary">
        <div>
          <dt>This week</dt>
          <dd>
            <b>
              {w.metDays} of {w.days}
            </b>{' '}
            {w.days === 1 ? 'day' : 'days'} at goal · about {fmt(w.averageMl)} a day
          </dd>
        </div>
        <div>
          <dt>{m.days < 30 ? `Since you started (${m.days} ${m.days === 1 ? 'day' : 'days'})` : 'Last 30 days'}</dt>
          <dd>
            <b>
              {m.metDays} of {m.days}
            </b>{' '}
            {m.days === 1 ? 'day' : 'days'} at goal · about {fmt(m.averageMl)} a day · {m.loggedDays} {m.loggedDays === 1 ? 'day' : 'days'} logged
            {m.best ? ` · best day ${dayLabel(m.best.day, today)} (${fmt(m.best.ml)})` : ''}
          </dd>
        </div>
      </dl>
      <ol className="month-strip" aria-label="Each day this month: filled when the goal was met">
        {strip.map((d) => {
          const ml = totals.get(d) ?? 0;
          const met = ml >= goalFor(d);
          return (
            <li key={d} data-met={met || undefined} data-some={(ml > 0 && !met) || undefined}>
              <span className="sr-only">
                {dayLabel(d, today)}: {fmt(ml)}
                {met ? ', goal met' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="small muted">A full dot is a day at goal; a half dot, a day with some water logged. Going past the goal earns nothing extra.</p>
    </section>
  );
}

/** What was found in Ripple's spring (Atlas), and the daily quest. */
function SpringLog() {
  const today = useToday();
  const week = lastNDays(today, 7);
  const rows = useLiveQuery(() => db.discoveries.where('day').anyOf(week).toArray(), [today]);
  if (!rows) return null;
  const todays = rows.find((r) => r.day === today);
  const quests = rows.filter((r) => r.completedAt).length;
  return (
    <section className="fold" style={{ '--i': 2 } as React.CSSProperties} aria-labelledby="spring-h">
      <h2 id="spring-h">The spring</h2>
      <p>
        Today&rsquo;s quest: <b>{todays?.found.length ?? 0} of 4</b> found in Atlas
        {todays?.completedAt ? ' · complete' : ''}. Quests completed this week: <b>{quests}</b>.
      </p>
      <p className="small muted">Touch Ripple, the water, a lily pad and the bamboo spout in Atlas to find all four. Exploring never changes your water log.</p>
    </section>
  );
}

function Stickers() {
  const records = useLiveQuery(() => db.tasks.toArray(), []);
  const done = new Map((records ?? []).filter((r) => r.status === 'done').map((r) => [r.id, r]));
  const earned = FIELD_TASKS.filter((t) => done.has(t.id));

  return (
    <section className="fold" style={{ '--i': 4 } as React.CSSProperties} aria-labelledby="stickers-h">
      <h2 id="stickers-h">Stickers</h2>
      <p className="small muted">
        {earned.length} of {FIELD_TASKS.length} pressed in
      </p>
      <ul className="sticker-grid">
        {FIELD_TASKS.map((t) =>
          done.has(t.id) ? (
            <li key={t.id} className="sticker-slot earned">
              <Sticker id={t.sticker} size={52} />
            </li>
          ) : (
            <li key={t.id} className="sticker-slot" aria-label="Empty sticker slot">
              <span aria-hidden="true">{t.day}</span>
            </li>
          )
        )}
      </ul>
      {earned.length > 0 && (
        <details className="answers">
          <summary>What you wrote down</summary>
          <dl>
            {earned.map((t) => (
              <div key={t.id}>
                <dt>
                  {t.title} <span className="sr-only">({stickerName(t.sticker)})</span>
                </dt>
                <dd>{answerSummary(t, done.get(t.id)?.answer)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

function Notes() {
  const today = useToday();
  const notes = useLiveQuery(() => db.notes.orderBy('day').reverse().toArray(), []);
  const saved = notes?.find((n) => n.day === today)?.text ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const toast = useToast();
  const id = useId();
  const text = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved;

  // A new day starts with a fresh page.
  useEffect(() => setDraft(null), [today]);

  const past = (notes ?? []).filter((n) => n.day !== today);
  return (
    <section className="fold" style={{ '--i': 5 } as React.CSSProperties} aria-labelledby="notes-h">
      <h2 id="notes-h">A line a day</h2>
      <form
        className="field"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveNote(today, text);
          setDraft(null);
          toast({ text: text.trim() ? 'Line saved.' : 'Line cleared.' });
        }}
      >
        <label htmlFor={id} className="label">
          Today
        </label>
        <textarea
          id={id}
          className="note-input"
          rows={2}
          maxLength={NOTE_MAX}
          placeholder="Anything worth remembering about today?"
          value={text}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="row note-row">
          <span className="small muted" aria-live="polite">
            {text.length > NOTE_MAX - 40 ? `${NOTE_MAX - text.length} characters left` : ''}
          </span>
          <button type="submit" className="btn ghost" disabled={!dirty}>
            Save line
          </button>
        </div>
      </form>
      {past.length > 0 && (
        <ul className="past-notes">
          {past.map((n) => (
            <li key={n.day}>
              <span className="label">{dayLabel(n.day, today)}</span>
              <p className="hand">{n.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
