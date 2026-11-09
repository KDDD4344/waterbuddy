import { beforeEach, describe, expect, it } from 'vitest';
import { answerSummary, cueSentence, FIELD_TASKS, firstGlassCue, taskState, type TaskRecordLike } from './tasks';
import { db } from '../data/db';
import { completeOnboarding, completeTask, deleteEverything, exportAll, saveNote, skipTask } from '../data/repo';
import { dayKey } from './dates';

const D1 = '2026-11-10';
const D2 = '2026-11-11';

describe('field task rules', () => {
  it('has 14 tasks, one per day, each with its own sticker', () => {
    expect(FIELD_TASKS).toHaveLength(14);
    expect(FIELD_TASKS.map((t) => t.day)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(new Set(FIELD_TASKS.map((t) => t.sticker)).size).toBe(14);
  });

  it('offers the first task on day one', () => {
    const s = taskState([], D1);
    expect(s.state).toBe('available');
    expect(s.state === 'available' && s.task.id).toBe('first-cue');
  });

  it('allows one task a day', () => {
    const recs: TaskRecordLike[] = [{ id: 'first-cue', status: 'done', day: D1 }];
    const today = taskState(recs, D1);
    expect(today.state).toBe('done-today');
    expect(today.state === 'done-today' && today.next?.id).toBe('bottle-home');
    const tomorrow = taskState(recs, D2);
    expect(tomorrow.state === 'available' && tomorrow.task.id).toBe('bottle-home');
  });

  it('"Not today" costs nothing: the same task returns tomorrow', () => {
    const recs: TaskRecordLike[] = [{ id: 'first-cue', status: 'skipped', day: D1 }];
    expect(taskState(recs, D1).state).toBe('skipped-today');
    const tomorrow = taskState(recs, D2);
    expect(tomorrow.state === 'available' && tomorrow.task.id).toBe('first-cue');
  });

  it('completes after all 14', () => {
    const recs: TaskRecordLike[] = FIELD_TASKS.map((t) => ({ id: t.id, status: 'done', day: '2026-01-01' }));
    expect(taskState(recs, D1).state).toBe('complete');
  });

  it('builds sentences and summaries', () => {
    const cue = FIELD_TASKS[0]!;
    expect(cueSentence(cue, ' have my morning chai ')).toBe("When I have my morning chai, I'll fill my glass too.");
    expect(firstGlassCue([{ id: 'first-cue', status: 'done', day: D1, answer: { kind: 'text', value: 'brush my teeth' } }])).toBe('brush my teeth');
    expect(answerSummary(FIELD_TASKS.find((t) => t.id === 'last-call')!, { kind: 'time', value: '22:30' })).toBe('Usually asleep by 22:30');
  });
});

describe('field task storage', () => {
  beforeEach(async () => {
    await deleteEverything();
    await completeOnboarding({
      ageBand: '18-64',
      goalMl: 2000,
      goalSource: 'suggested',
      units: 'ml',
      cupMl: 250,
      parentConfirmed: false,
      vessels: [{ name: 'Glass', ml: 250 }]
    });
  });

  it('a skip never overwrites a finished task', async () => {
    await completeTask('first-cue', { kind: 'text', value: 'brush my teeth' });
    await skipTask('first-cue');
    expect((await db.tasks.get('first-cue'))?.status).toBe('done');
  });

  it('the last-call and reminder tasks save settings for Phase 6', async () => {
    await completeTask('last-call', { kind: 'time', value: '23:00' });
    await completeTask('reminder-time', { kind: 'text', value: 'Around lunch' });
    const p = await db.profile.get('me');
    expect(p?.bedtime).toBe('23:00');
    expect(p?.reminderPref).toBe('Around lunch');
  });

  it('saves, trims and clears notes, and exports them', async () => {
    const day = dayKey(new Date());
    await saveNote(day, '  Bottle by the bed helped.  ');
    expect((await db.notes.get(day))?.text).toBe('Bottle by the bed helped.');
    const file = await exportAll();
    expect(file.notes).toHaveLength(1);
    await saveNote(day, '   ');
    expect(await db.notes.get(day)).toBeUndefined();
  });
});
