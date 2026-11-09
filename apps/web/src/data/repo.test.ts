import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addLog,
  clearDay,
  completeOnboarding,
  deleteEverything,
  exportAll,
  goalOn,
  logsForDay,
  removeLog,
  restoreLog,
  restoreLogs,
  setGoal,
  totalsForDays,
  updateLog
} from './repo';
import { dayKey } from '../domain/dates';

const onboarding = {
  ageBand: '18-64' as const,
  goalMl: 2000,
  goalSource: 'suggested' as const,
  units: 'ml' as const,
  cupMl: 250,
  parentConfirmed: false,
  vessels: [
    { name: 'Glass', ml: 200 },
    { name: ' Steel tumbler ', ml: 250 }
  ]
};

beforeEach(async () => {
  await deleteEverything();
});

describe('repo', () => {
  it('saves onboarding: profile, ordered vessels, first goal', async () => {
    await completeOnboarding(onboarding);
    expect((await db.profile.get('me'))?.goalMl).toBe(2000);
    const vessels = await db.vessels.orderBy('order').toArray();
    expect(vessels.map((v) => v.name)).toEqual(['Glass', 'Steel tumbler']);
    expect(await db.goals.count()).toBe(1);
  });

  it('logs, undoes and restores a drink', async () => {
    const now = new Date();
    const log = await addLog(250, null, now);
    const day = dayKey(now);
    expect((await logsForDay(day)).map((l) => l.ml)).toEqual([250]);
    await removeLog(log.id);
    expect(await logsForDay(day)).toEqual([]);
    await restoreLog(log.id);
    expect((await logsForDay(day)).length).toBe(1);
  });

  it('rejects impossible amounts', async () => {
    await expect(addLog(0)).rejects.toThrow(RangeError);
    await expect(addLog(25000)).rejects.toThrow(RangeError);
  });

  it('edits amount and moves an entry to another day when its time changes', async () => {
    const now = new Date();
    const log = await addLog(250, null, now);
    const yesterday = new Date(now.getTime() - 26 * 3600_000);
    await updateLog(log.id, { ml: 300, at: yesterday });
    expect(await logsForDay(dayKey(now))).toEqual([]);
    const moved = await logsForDay(dayKey(yesterday));
    expect(moved[0]?.ml).toBe(300);
  });

  it('totals days and ignores deleted entries', async () => {
    const now = new Date();
    const day = dayKey(now);
    await addLog(250, null, now);
    const b = await addLog(500, null, now);
    await removeLog(b.id);
    const totals = await totalsForDays([day, '2000-01-01']);
    expect(totals.get(day)).toBe(250);
    expect(totals.get('2000-01-01')).toBe(0);
  });

  it('clears a day and can undo it', async () => {
    const now = new Date();
    await addLog(250, null, now);
    await addLog(250, null, now);
    const ids = await clearDay(dayKey(now));
    expect(await logsForDay(dayKey(now))).toEqual([]);
    await restoreLogs(ids);
    expect((await logsForDay(dayKey(now))).length).toBe(2);
  });

  it('keeps goal history so old days use the goal of that day', async () => {
    await completeOnboarding(onboarding, new Date('2026-11-01T06:00:00Z'));
    await setGoal(2500, 'custom', new Date('2026-11-05T06:00:00Z'));
    const changes = await db.goals.toArray();
    expect(goalOn('2026-11-03', changes, 0)).toBe(2000);
    expect(goalOn('2026-11-07', changes, 0)).toBe(2500);
    expect((await db.profile.get('me'))?.goalMl).toBe(2500);
  });

  it('exports live data and deletes everything', async () => {
    await completeOnboarding(onboarding);
    await addLog(250);
    const file = await exportAll();
    expect(file.app).toBe('WaterBuddy');
    expect(file.logs.length).toBe(1);
    await deleteEverything();
    expect(await db.logs.count()).toBe(0);
    expect(await db.profile.get('me')).toBeUndefined();
  });
});
