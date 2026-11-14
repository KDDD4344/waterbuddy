import { describe, expect, it } from 'vitest';
import { Animator, DURATION, restPose, type Pose, type Temperament } from './animator';
import {
  drunk,
  localDate,
  logGlass,
  progress,
  removeEntry,
  restoreDay,
  serializeDay,
  startingDay,
  undoLast,
  GLASS_ML
} from './hydration';
import { levelFor, LEVEL_EMPTY, LEVEL_FULL, poolRadiusAtLevel } from './world';

const NOW = new Date('2026-11-11T15:00:00+05:30');

describe('lab hydration rules', () => {
  it('starts part-way through the day without tripping the sip guard', () => {
    const day = startingDay(2000, 750, NOW);
    expect(drunk(day)).toBe(750);
    expect(logGlass(day, NOW).rushing).toBe(false);
  });

  it('celebrates only the glass that reaches the goal, never after (safety rule 1)', () => {
    let day = { goal: 1000, logs: [] as { ml: number; at: string }[] };
    const outcomes = [];
    for (let i = 0; i < 6; i++) {
      // An hour apart, so the sip guard stays out of this test.
      const out = logGlass(day, new Date(NOW.getTime() + i * 61 * 60 * 1000));
      outcomes.push(out);
      day = out.day;
    }
    expect(outcomes.map((o) => o.reachedGoal)).toEqual([false, false, false, true, false, false]);
    expect(outcomes.map((o) => o.pastGoal)).toEqual([false, false, false, false, true, true]);
    expect(progress(day)).toBe(1);
  });

  it('suggests sipping slowly after more than a litre in an hour (safety rule 4)', () => {
    let day = { goal: 3000, logs: [] as { ml: number; at: string }[] };
    const rushing: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const out = logGlass(day, new Date(NOW.getTime() + i * 5 * 60 * 1000));
      rushing.push(out.rushing);
      day = out.day;
    }
    // 4 × 250 = 1000 is the limit; the fifth glass goes over it.
    expect(rushing).toEqual([false, false, false, false, true]);
    expect(drunk(day)).toBe(5 * GLASS_ML);
  });
});

describe('sip guard uses real drinking times', () => {
  const min = 60 * 1000;
  it('ignores seeded demo entries, even inside the hour', () => {
    const seeded = Array.from({ length: 4 }, (_, i) => ({
      ml: 250,
      at: new Date(NOW.getTime() - (10 + i) * min).toISOString(),
      source: 'seeded' as const
    }));
    const out = logGlass({ goal: 2000, logs: seeded }, NOW);
    expect(out.rushing).toBe(false);
    expect(drunk(out.day)).toBe(1250);
  });

  it("doesn't mistake catching up on earlier glasses for drinking fast", () => {
    // Five glasses entered within a minute, but drunk across the morning.
    let day = { goal: 2500, logs: [] as { ml: number; at: string }[] };
    const rushing: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const enteredAt = new Date(NOW.getTime() + i * 10 * 1000);
      const drankAt = new Date(NOW.getTime() - (4 - i) * 70 * min);
      const out = logGlass(day, enteredAt, 250, drankAt);
      rushing.push(out.rushing);
      day = out.day;
    }
    expect(rushing.every((r) => !r)).toBe(true);
    expect(drunk(day)).toBe(1250);
  });

  it('still warns when glasses really were drunk close together', () => {
    let day = { goal: 3000, logs: [] as { ml: number; at: string }[] };
    let last = false;
    for (let i = 0; i < 5; i++) {
      const out = logGlass(day, new Date(NOW.getTime() + i * 8 * min));
      last = out.rushing;
      day = out.day;
    }
    expect(last).toBe(true);
  });

  it('never dates a glass in the future', () => {
    const out = logGlass({ goal: 2000, logs: [] }, NOW, 250, new Date(NOW.getTime() + 60 * min));
    expect(out.day.logs[0]!.at).toBe(NOW.toISOString());
  });
});

describe('saving the day and undo', () => {
  const min = 60 * 1000;
  it('keeps every glass across a reload, on the same day', () => {
    let day = startingDay(2000, 750, NOW);
    day = logGlass(day, NOW).day;
    const back = restoreDay(serializeDay(day, NOW), new Date(NOW.getTime() + 5 * min));
    expect(back).toEqual(day);
    expect(drunk(back!)).toBe(1000);
  });

  it('starts fresh on a new day, and ignores damaged or unknown data', () => {
    const day = logGlass(startingDay(2000, 750, NOW), NOW).day;
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * min);
    expect(restoreDay(serializeDay(day, NOW), tomorrow)).toBeNull();
    expect(restoreDay('{not json', NOW)).toBeNull();
    expect(restoreDay(null, NOW)).toBeNull();
    const bad = JSON.parse(serializeDay(day, NOW));
    bad.logs[0].ml = -250;
    expect(restoreDay(JSON.stringify(bad), NOW)).toBeNull();
    expect(restoreDay(JSON.stringify({ ...JSON.parse(serializeDay(day, NOW)), v: 99 }), NOW)).toBeNull();
  });

  it('undo takes back only the last glass the person logged, never seeded entries', () => {
    const start = startingDay(2000, 750, NOW);
    expect(undoLast(start).removed).toBeNull();
    expect(undoLast(start).day).toBe(start);
    const a = logGlass(start, NOW).day;
    const b = logGlass(a, new Date(NOW.getTime() + 61 * min)).day;
    const u = undoLast(b);
    expect(u.removed?.at).toBe(new Date(NOW.getTime() + 61 * min).toISOString());
    expect(drunk(u.day)).toBe(1000);
    expect(drunk(undoLast(undoLast(u.day).day).day)).toBe(750);
  });

  it('Undo removes exactly the glass it was offered for, and only once', () => {
    const a = logGlass(startingDay(2000, 750, NOW), NOW);
    const glassA = a.day.logs.at(-1)!;
    const b = logGlass(a.day, new Date(NOW.getTime() + 61 * min));
    // Undo offered for glass A after glass B was logged elsewhere: B stays.
    const u = removeEntry(b.day, glassA);
    expect(u.removed).toEqual(glassA);
    expect(u.day.logs.at(-1)).toEqual(b.day.logs.at(-1));
    // A second Undo for the same glass changes nothing.
    const again = removeEntry(u.day, glassA);
    expect(again.removed).toBeNull();
    expect(again.day).toBe(u.day);
    // Seeded demo entries can't be undone.
    expect(removeEntry(b.day, b.day.logs[0]!).removed).toBeNull();
  });

  it("files a day under its own date, not the moment it's saved", () => {
    const day = logGlass(startingDay(2000, 750, NOW), NOW).day;
    const nextMorning = new Date(NOW.getTime() + 10 * 60 * min);
    const raw = serializeDay(day, localDate(NOW));
    expect(restoreDay(raw, NOW)).toEqual(day);
    // Saved just after midnight, it's still yesterday's day, so it isn't shown as today.
    expect(restoreDay(raw, nextMorning)).toBeNull();
  });

  it('a fresh day never has entries from the day before, even just after midnight', () => {
    const justAfter = new Date(2026, 10, 13, 0, 1);
    const d = startingDay(2000, 750, justAfter);
    expect(d.logs.every((l) => localDate(new Date(l.at)) === localDate(justAfter))).toBe(true);
    expect(drunk(d)).toBe(750);
  });

  it('undoing the goal glass and logging again never celebrates twice', () => {
    let day = startingDay(1000, 750, NOW);
    const first = logGlass(day, NOW);
    expect(first.reachedGoal).toBe(true);
    day = undoLast(first.day).day;
    expect(drunk(day)).toBe(750);
    const again = logGlass(day, new Date(NOW.getTime() + 2 * min));
    expect(again.reachedGoal).toBe(false);
    expect(drunk(again.day)).toBe(1000);
    // Still remembered after a reload.
    expect(restoreDay(serializeDay(day, NOW), NOW)?.celebrated).toBe(true);
  });
});

describe('spring level', () => {
  it('maps progress onto the pool, capped at full', () => {
    expect(levelFor(0)).toBe(LEVEL_EMPTY);
    expect(levelFor(1)).toBe(LEVEL_FULL);
    expect(levelFor(2)).toBe(LEVEL_FULL);
    expect(levelFor(0.5)).toBeCloseTo((LEVEL_EMPTY + LEVEL_FULL) / 2);
  });

  it('a fuller spring is a wider pool', () => {
    expect(poolRadiusAtLevel(levelFor(1))).toBeGreaterThan(poolRadiusAtLevel(levelFor(0.25)) + 0.5);
  });
});

const JELLY: Temperament = { bounce: 1, tempo: 1.1, float: 0 };
const STONE: Temperament = { bounce: 0.45, tempo: 0.8, float: 0 };

function run(a: Animator, seconds: number, each?: (p: Pose) => void) {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const p = a.update(1 / 60);
    each?.(p);
    events.push(...a.drainEvents());
  }
  return events;
}

describe('animator', () => {
  it('is deterministic for a given seed', () => {
    const a = new Animator(JELLY, false, 3);
    const b = new Animator(JELLY, false, 3);
    a.trigger('happy');
    b.trigger('happy');
    run(a, 1.1);
    run(b, 1.1);
    expect(a.update(1 / 60)).toEqual(b.update(1 / 60));
  });

  it('celebrates with a jump: apex, then landing, then done', () => {
    const a = new Animator(JELLY);
    a.trigger('celebrate');
    let maxHop = 0;
    const events = run(a, DURATION.celebrate / JELLY.tempo + 0.5, (p) => (maxHop = Math.max(maxHop, p.hop)));
    expect(events).toEqual(['apex', 'land', 'end']);
    expect(maxHop).toBeGreaterThan(0.3);
    expect(a.playing).toBeNull();
  });

  it('gives each temperament its own weight: a stone hops lower than a jelly', () => {
    const peak = (t: Temperament) => {
      const a = new Animator(t);
      a.trigger('celebrate');
      let m = 0;
      run(a, 4, (p) => (m = Math.max(m, p.hop)));
      return m;
    };
    expect(peak(STONE)).toBeLessThan(peak(JELLY) * 0.6);
  });

  it('keeps reactions but drops jumps and spins with reduced motion', () => {
    const a = new Animator(JELLY, true);
    a.trigger('celebrate');
    let maxHop = 0;
    let maxSpin = 0;
    let maxSmile = 0;
    run(a, 4, (p) => {
      maxHop = Math.max(maxHop, Math.abs(p.hop));
      maxSpin = Math.max(maxSpin, Math.abs(p.spin));
      maxSmile = Math.max(maxSmile, p.smile);
    });
    expect(maxHop).toBe(0);
    expect(maxSpin).toBe(0);
    expect(maxSmile).toBeGreaterThan(0.9);
  });

  it('blinks on its own and settles back to rest after a reaction', () => {
    const a = new Animator(JELLY);
    let blinked = false;
    run(a, 8, (p) => (blinked ||= p.blink > 0.9));
    expect(blinked).toBe(true);
    a.trigger('curious', -1);
    let tilt = 0;
    run(a, 1.2, (p) => (tilt = Math.min(tilt, p.tilt)));
    expect(tilt).toBeLessThan(-0.15);
    run(a, 3);
    const p = a.update(1 / 60);
    const rest = restPose();
    expect(Math.abs(p.tilt)).toBeLessThan(0.02);
    expect(p.smile).toBeCloseTo(rest.smile, 1);
    for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });
});
