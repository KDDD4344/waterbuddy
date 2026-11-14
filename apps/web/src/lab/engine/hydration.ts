/**
 * The lab's day of drinking: one goal, 250 ml glasses. Pure, so the rules are unit-tested.
 * Keeps WaterBuddy's safety rules: no reward past the goal (rule 1) and sip, don't rush (rule 4,
 * reusing the app's own guard and threshold).
 */
import { shouldShowSipGuard, type TimedAmount } from '../../domain/guards';

export const GLASS_ML = 250;

/**
 * One drink. `at` is when it was drunk (which can be earlier than when it was entered);
 * `source` marks demo entries the lab seeds so the spring isn't empty on first look.
 */
export interface LogEntry extends TimedAmount {
  source?: 'logged' | 'seeded';
  /**
   * A unique id, so two tabs that log at the same moment merge instead of overwriting each
   * other. Older saved entries without one get a stable id from their contents (`entryKey`).
   */
  id?: string;
}

/** The identity of an entry: its id, or (for older saves) its kind, time and amount. */
export function entryKey(l: LogEntry): string {
  return l.id ?? `${l.source ?? 'logged'}|${l.at}|${l.ml}`;
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface Day {
  goal: number;
  logs: LogEntry[];
  /**
   * The goal has been celebrated today. Kept even if that glass is undone, so undoing and
   * logging again can never earn a second celebration.
   */
  celebrated?: boolean;
  /**
   * Keys of entries that were undone. Kept so another tab that still has the entry can't bring
   * it back when the two are merged.
   */
  removed?: string[];
}

export interface LogOutcome {
  day: Day;
  before: number;
  after: number;
  /** This glass is the one that reached the goal: the only time Buddy celebrates. */
  reachedGoal: boolean;
  /** The goal was already met before this glass: quiet acknowledgement, no reward. */
  pastGoal: boolean;
  /** More than the guard's limit within an hour: suggest sipping slowly. */
  rushing: boolean;
}

export function drunk(day: Day): number {
  return day.logs.reduce((s, l) => s + l.ml, 0);
}

/** 0 to 1, capped at the goal. */
export function progress(day: Day): number {
  return day.goal > 0 ? Math.min(1, drunk(day) / day.goal) : 0;
}

/**
 * Logs a glass. `drankAt` is when it was actually drunk (defaults to now), so a glass entered
 * late counts at its real time. The sip guard looks only at real drinking times, and never at
 * seeded demo entries, so catching up on earlier glasses can't read as drinking fast.
 */
export function logGlass(day: Day, now: Date, ml = GLASS_ML, drankAt: Date = now): LogOutcome {
  const before = drunk(day);
  const at = drankAt.getTime() > now.getTime() ? now : drankAt;
  const after = before + ml;
  const reachedGoal = before < day.goal && after >= day.goal && !day.celebrated;
  const next: Day = {
    ...day,
    logs: [...day.logs, { ml, at: at.toISOString(), source: 'logged', id: newId() }],
    ...(reachedGoal ? { celebrated: true } : {})
  };
  return {
    day: next,
    before,
    after,
    reachedGoal,
    pastGoal: before >= day.goal,
    rushing: shouldShowSipGuard(
      next.logs.filter((l) => l.source !== 'seeded'),
      now
    )
  };
}

/** A lab day starts part-way through, so the spring isn't empty on first look. */
export function startingDay(goal = 2000, startMl = 750, now = new Date()): Day {
  const logs: LogEntry[] = [];
  // Never before midnight: just after midnight they bunch up at 00:00 rather than landing
  // on the day before.
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (let ml = 0, i = 0; ml < startMl; ml += GLASS_ML, i++) {
    // Spread over the morning, and marked as seeded so they never count as drinking speed.
    const at = Math.max(midnight, now.getTime() - (4 - i) * 90 * 60 * 1000);
    logs.push({ ml: GLASS_ML, at: new Date(at).toISOString(), source: 'seeded', id: `seed-${i}` });
  }
  return { goal, logs };
}

/**
 * Takes back the most recent glass the person logged (a mis-tap). Seeded demo entries are
 * never removed. Returns the day unchanged and `removed: null` when there's nothing to undo.
 */
export function undoLast(day: Day): { day: Day; removed: LogEntry | null } {
  for (let i = day.logs.length - 1; i >= 0; i--) {
    if (day.logs[i]!.source === 'seeded') continue;
    const logs = day.logs.slice();
    const [removed] = logs.splice(i, 1);
    return { day: { ...day, logs }, removed: removed! };
  }
  return { day, removed: null };
}

/** The calendar day an entry belongs to, in local time (YYYY-MM-DD). */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const STORE_VERSION = 1;

/**
 * What the lab keeps on this device: a day's goal and drinks, labelled with the calendar day
 * they belong to (`date`: that day's date, not the moment of saving, so a page left open past
 * midnight can never file yesterday's drinks under today).
 */
export function serializeDay(day: Day, date: Date | string): string {
  return JSON.stringify({ v: STORE_VERSION, date: typeof date === 'string' ? date : localDate(date), ...day });
}

/**
 * Removes one specific entry (the glass an Undo was offered for), matched by its identity, and
 * remembers it was removed. Anything else, including a second Undo for the same glass, changes
 * nothing.
 */
export function removeEntry(day: Day, entry: LogEntry): { day: Day; removed: LogEntry | null } {
  const key = entryKey(entry);
  const i = day.logs.findIndex((l) => l.source !== 'seeded' && entryKey(l) === key);
  if (i < 0) return { day, removed: null };
  const logs = day.logs.slice();
  const [removed] = logs.splice(i, 1);
  return { day: { ...day, logs, removed: [...(day.removed ?? []), key] }, removed: removed! };
}

/**
 * Combines two copies of the same day (this tab's and another tab's): every glass either one
 * has, minus anything either one undid. Order-independent and repeatable, so two tabs that
 * save at the same moment end up with the same day and nothing lost.
 */
export function mergeDays(a: Day, b: Day): Day {
  const removed = [...new Set([...(a.removed ?? []), ...(b.removed ?? [])])];
  const gone = new Set(removed);
  const byKey = new Map<string, LogEntry>();
  for (const l of [...a.logs, ...b.logs]) {
    const k = entryKey(l);
    if (!gone.has(k) && !byKey.has(k)) byKey.set(k, l);
  }
  const logs = [...byKey.values()].sort((x, y) => x.at.localeCompare(y.at) || entryKey(x).localeCompare(entryKey(y)));
  return {
    goal: a.goal,
    logs,
    ...(a.celebrated || b.celebrated ? { celebrated: true } : {}),
    ...(removed.length ? { removed } : {})
  };
}

/** True when two days hold the same entries, removals and celebration. */
export function sameDay(a: Day, b: Day): boolean {
  const sig = (d: Day) =>
    JSON.stringify([d.goal, d.logs.map(entryKey).sort(), [...(d.removed ?? [])].sort(), !!d.celebrated]);
  return sig(a) === sig(b);
}

/**
 * Reads a saved day back. Returns null (so the caller starts fresh) when there's nothing
 * saved, it's from another day, or it doesn't look right; a bad entry is never half-loaded.
 */
export function restoreDay(raw: string | null, now: Date | string): Day | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Day> & { v?: number; date?: string };
    if (o.v !== STORE_VERSION || o.date !== (typeof now === 'string' ? now : localDate(now))) return null;
    if (typeof o.goal !== 'number' || !(o.goal > 0 && o.goal <= 10000) || !Array.isArray(o.logs)) return null;
    const logs: LogEntry[] = [];
    for (const l of o.logs as unknown[]) {
      const e = l as Partial<LogEntry>;
      if (typeof e.ml !== 'number' || !(e.ml > 0 && e.ml <= 2000)) return null;
      if (typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) return null;
      if (e.source !== undefined && e.source !== 'logged' && e.source !== 'seeded') return null;
      if (e.id !== undefined && (typeof e.id !== 'string' || e.id.length > 100)) return null;
      logs.push({ ml: e.ml, at: e.at, ...(e.source ? { source: e.source } : {}), ...(e.id ? { id: e.id } : {}) });
    }
    const removed = o.removed;
    if (removed !== undefined && !(Array.isArray(removed) && removed.every((k) => typeof k === 'string'))) return null;
    return {
      goal: o.goal,
      logs,
      ...(o.celebrated ? { celebrated: true } : {}),
      ...(removed?.length ? { removed } : {})
    };
  } catch {
    return null;
  }
}

export function formatMl(ml: number): string {
  return `${ml.toLocaleString('en-IN')} ml`;
}
