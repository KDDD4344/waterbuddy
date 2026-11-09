import { db, newId, type DrinkLog, type GoalChange, type Note, type PostcardRecord, type Profile, type TaskRecord, type Vessel } from './db';
import { cardsToDeliver } from '../domain/voyage';
import { dayKey, deviceTimeZone, type DayKey } from '../domain/dates';
import { MAX_SINGLE_LOG_ML } from '../domain/guards';
import type { TaskAnswer } from '../domain/tasks';

export const DEFAULT_VESSELS: Omit<Vessel, 'order'>[] = [
  { id: 'glass', name: 'Glass', ml: 200 },
  { id: 'tumbler', name: 'Steel tumbler', ml: 250 },
  { id: 'bottle-500', name: 'Bottle', ml: 500 },
  { id: 'bottle-1000', name: 'Steel bottle', ml: 1000 }
];

export interface OnboardingInput {
  ageBand: Profile['ageBand'];
  goalMl: number;
  goalSource: Profile['goalSource'];
  units: Profile['units'];
  cupMl: number;
  parentConfirmed: boolean;
  vessels: { name: string; ml: number }[];
}

export async function completeOnboarding(input: OnboardingInput, now = new Date()): Promise<void> {
  await db.transaction('rw', db.profile, db.vessels, db.goals, async () => {
    await db.profile.put({
      id: 'me',
      ageBand: input.ageBand,
      goalMl: input.goalMl,
      goalSource: input.goalSource,
      units: input.units,
      cupMl: input.cupMl,
      parentConfirmed: input.parentConfirmed,
      createdAt: now.toISOString()
    });
    await db.vessels.clear();
    await db.vessels.bulkPut(input.vessels.map((v, i) => ({ id: newId(), name: v.name.trim(), ml: v.ml, order: i })));
    await db.goals.put({ id: newId(), ml: input.goalMl, day: dayKey(now), source: input.goalSource, at: now.toISOString() });
  });
}

export function validLogMl(ml: number): boolean {
  return Number.isFinite(ml) && ml >= 10 && ml <= MAX_SINGLE_LOG_ML;
}

export async function addLog(ml: number, vesselId: string | null = null, now = new Date()): Promise<DrinkLog> {
  if (!validLogMl(ml)) throw new RangeError(`Log amount out of range: ${ml}`);
  const tz = deviceTimeZone();
  const log: DrinkLog = { id: newId(), ml: Math.round(ml), at: now.toISOString(), day: dayKey(now, tz), tz, vesselId, deletedAt: null };
  await db.logs.add(log);
  return log;
}

export async function removeLog(id: string, now = new Date()): Promise<void> {
  await db.logs.update(id, { deletedAt: now.toISOString() });
}

export async function restoreLog(id: string): Promise<void> {
  await db.logs.update(id, { deletedAt: null });
}

/** Edit an entry's amount and/or time. The local day is recomputed from the new time. */
export async function updateLog(id: string, changes: { ml?: number; at?: Date }): Promise<void> {
  const existing = await db.logs.get(id);
  if (!existing) return;
  const patch: Partial<DrinkLog> = {};
  if (changes.ml !== undefined) {
    if (!validLogMl(changes.ml)) throw new RangeError(`Log amount out of range: ${changes.ml}`);
    patch.ml = Math.round(changes.ml);
  }
  if (changes.at) {
    patch.at = changes.at.toISOString();
    patch.day = dayKey(changes.at, existing.tz);
  }
  await db.logs.update(id, patch);
}

export async function logsForDay(day: DayKey): Promise<DrinkLog[]> {
  const rows = await db.logs.where('day').equals(day).toArray();
  return rows.filter((l) => !l.deletedAt).sort((a, b) => a.at.localeCompare(b.at));
}

export async function totalsForDays(days: DayKey[]): Promise<Map<DayKey, number>> {
  const rows = await db.logs.where('day').anyOf(days).toArray();
  const totals = new Map<DayKey, number>(days.map((d) => [d, 0]));
  for (const l of rows) if (!l.deletedAt) totals.set(l.day, (totals.get(l.day) ?? 0) + l.ml);
  return totals;
}

/** The goal that applied on a given day (latest change on or before it). */
export function goalOn(day: DayKey, changes: GoalChange[], fallback: number): number {
  let best: GoalChange | null = null;
  for (const c of changes) {
    if (c.day <= day && (!best || c.day > best.day || (c.day === best.day && c.at > best.at))) best = c;
  }
  return best?.ml ?? fallback;
}

export async function setGoal(ml: number, source: GoalChange['source'], now = new Date()): Promise<void> {
  await db.transaction('rw', db.profile, db.goals, async () => {
    await db.profile.update('me', { goalMl: ml, goalSource: source });
    await db.goals.put({ id: newId(), ml, day: dayKey(now), source, at: now.toISOString() });
  });
}

export async function updateProfile(patch: Partial<Omit<Profile, 'id'>>): Promise<void> {
  await db.profile.update('me', patch);
}

export async function saveVessels(list: { id?: string; name: string; ml: number }[]): Promise<void> {
  await db.transaction('rw', db.vessels, async () => {
    await db.vessels.clear();
    await db.vessels.bulkPut(list.map((v, i) => ({ id: v.id ?? newId(), name: v.name.trim(), ml: v.ml, order: i })));
  });
}

/** Soft-deletes every entry for a day and returns their ids so the action can be undone. */
export async function clearDay(day: DayKey, now = new Date()): Promise<string[]> {
  const live = await logsForDay(day);
  await db.logs.bulkUpdate(live.map((l) => ({ key: l.id, changes: { deletedAt: now.toISOString() } })));
  return live.map((l) => l.id);
}

export async function restoreLogs(ids: string[]): Promise<void> {
  await db.logs.bulkUpdate(ids.map((id) => ({ key: id, changes: { deletedAt: null } })));
}

// --- Field tasks and journal (Phase 3) ---

/** Finish a field task. Two tasks also update settings used by reminders later. */
export async function completeTask(taskId: string, answer: TaskAnswer, now = new Date()): Promise<void> {
  await db.transaction('rw', db.tasks, db.profile, async () => {
    await db.tasks.put({ id: taskId, status: 'done', day: dayKey(now), at: now.toISOString(), answer });
    if (taskId === 'last-call' && answer.kind === 'time') await db.profile.update('me', { bedtime: answer.value });
    if (taskId === 'reminder-time' && answer.kind === 'text') await db.profile.update('me', { reminderPref: answer.value });
  });
}

/** "Not today": costs nothing, and the task comes back tomorrow. */
export async function skipTask(taskId: string, now = new Date()): Promise<void> {
  const existing = await db.tasks.get(taskId);
  if (existing?.status === 'done') return;
  await db.tasks.put({ id: taskId, status: 'skipped', day: dayKey(now), at: now.toISOString() });
}

export async function saveNote(day: DayKey, text: string, now = new Date()): Promise<void> {
  const trimmed = text.trim().slice(0, NOTE_MAX);
  if (!trimmed) await db.notes.delete(day);
  else await db.notes.put({ day, text: trimmed, at: now.toISOString() });
}

export const NOTE_MAX = 280;

// --- Night voyage and postcards (Phase 4) ---

/** Days since the person started on which the goal of that day was met. */
async function goalMetDays(): Promise<DayKey[]> {
  const profile = await db.profile.get('me');
  if (!profile) return [];
  const [logs, goals] = await Promise.all([db.logs.toArray(), db.goals.toArray()]);
  const totals = new Map<DayKey, number>();
  for (const l of logs) if (!l.deletedAt) totals.set(l.day, (totals.get(l.day) ?? 0) + l.ml);
  return [...totals].filter(([day, total]) => total >= goalOn(day, goals, profile.goalMl)).map(([day]) => day);
}

/**
 * Bring in any postcards from voyages that have sailed: one per goal day before today.
 * Safe to call as often as we like; a day never earns two cards.
 */
export async function deliverPostcards(now = new Date()): Promise<PostcardRecord[]> {
  return db.transaction('rw', [db.profile, db.logs, db.goals, db.postcards], async () => {
    const [days, delivered] = await Promise.all([goalMetDays(), db.postcards.toArray()]);
    const fresh = cardsToDeliver(days, delivered, dayKey(now)).map(
      ({ day, card }): PostcardRecord => ({ id: card.id, day, deliveredAt: now.toISOString(), readAt: null })
    );
    if (fresh.length) await db.postcards.bulkAdd(fresh);
    return fresh;
  });
}

export async function markPostcardRead(id: string, now = new Date()): Promise<void> {
  await db.postcards.update(id, { readAt: now.toISOString() });
}

export interface ExportFile {
  app: 'WaterBuddy';
  format: 3;
  exportedAt: string;
  profile: Profile | undefined;
  vessels: Vessel[];
  goals: GoalChange[];
  logs: DrinkLog[];
  tasks: TaskRecord[];
  notes: Note[];
  postcards: PostcardRecord[];
}

export async function exportAll(now = new Date()): Promise<ExportFile> {
  const [profile, vessels, goals, logs, tasks, notes, postcards] = await Promise.all([
    db.profile.get('me'),
    db.vessels.orderBy('order').toArray(),
    db.goals.toArray(),
    db.logs.toArray(),
    db.tasks.toArray(),
    db.notes.toArray(),
    db.postcards.toArray()
  ]);
  return {
    app: 'WaterBuddy',
    format: 3,
    exportedAt: now.toISOString(),
    profile,
    vessels,
    goals,
    logs: logs.filter((l) => !l.deletedAt),
    tasks,
    notes,
    postcards
  };
}

/** Permanently removes everything stored on this device. */
export async function deleteEverything(): Promise<void> {
  await db.transaction('rw', [db.profile, db.vessels, db.logs, db.goals, db.tasks, db.notes, db.postcards], async () => {
    await Promise.all([db.profile.clear(), db.vessels.clear(), db.logs.clear(), db.goals.clear(), db.tasks.clear(), db.notes.clear(), db.postcards.clear()]);
  });
}
