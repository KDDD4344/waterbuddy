import { beforeEach, describe, expect, it } from 'vitest';
import { cardsToDeliver, isAfterLastCall, lastCallTime, ROUTE_1, scenePhase } from './voyage';
import { db } from '../data/db';
import { addLog, completeOnboarding, deleteEverything, deliverPostcards, exportAll, markPostcardRead, removeLog } from '../data/repo';

const at = (iso: string) => new Date(iso);

describe('Route I content', () => {
  it('has six cards in order, each with at least one source', () => {
    expect(ROUTE_1.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of ROUTE_1) expect(c.sources.length).toBeGreaterThan(0);
  });

  it('marks cards unreviewed until a reviewer approves them', () => {
    expect(ROUTE_1.every((c) => c.reviewed === false)).toBe(true);
  });
});

describe('last call (safety rule 3)', () => {
  it('is two hours before bedtime', () => {
    expect(lastCallTime('22:30')).toBe('20:30');
    expect(lastCallTime('00:30')).toBe('22:30');
    expect(lastCallTime('01:00')).toBe('23:00');
  });

  it('runs from last call until 4 am', () => {
    expect(isAfterLastCall(at('2026-11-10T20:29:00'), '22:30')).toBe(false);
    expect(isAfterLastCall(at('2026-11-10T20:30:00'), '22:30')).toBe(true);
    expect(isAfterLastCall(at('2026-11-11T02:00:00'), '22:30')).toBe(true);
    expect(isAfterLastCall(at('2026-11-11T05:00:00'), '22:30')).toBe(false);
  });

  it('handles a bedtime after midnight', () => {
    expect(isAfterLastCall(at('2026-11-10T22:59:00'), '01:00')).toBe(false);
    expect(isAfterLastCall(at('2026-11-10T23:00:00'), '01:00')).toBe(true);
  });
});

describe('scene phase', () => {
  it('shows morning while a message is waiting', () => {
    expect(scenePhase(at('2026-11-10T21:00:00'), { goalMet: true, messageWaiting: true })).toBe('morning');
  });
  it('corks for the evening once the goal is met, and goes to night after dark', () => {
    expect(scenePhase(at('2026-11-10T15:00:00'), { goalMet: true, messageWaiting: false })).toBe('evening');
    expect(scenePhase(at('2026-11-10T19:30:00'), { goalMet: true, messageWaiting: false })).toBe('night');
  });
  it('goes to night at last call even without the goal, and never pushes', () => {
    expect(scenePhase(at('2026-11-10T21:00:00'), { goalMet: false, messageWaiting: false })).toBe('night');
    expect(scenePhase(at('2026-11-10T12:00:00'), { goalMet: false, messageWaiting: false })).toBe('day');
  });
});

describe('which cards wash up', () => {
  it('delivers one card per past goal day, in route order', () => {
    const out = cardsToDeliver(['2026-11-08', '2026-11-09'], [], '2026-11-10');
    expect(out.map((o) => [o.day, o.card.id])).toEqual([
      ['2026-11-08', 'loktak'],
      ['2026-11-09', 'umngot']
    ]);
  });

  it("waits for tonight's voyage before delivering today's card", () => {
    expect(cardsToDeliver(['2026-11-10'], [], '2026-11-10')).toEqual([]);
  });

  it('never delivers twice for the same day', () => {
    const out = cardsToDeliver(['2026-11-08', '2026-11-09'], [{ id: 'loktak', day: '2026-11-08' }], '2026-11-10');
    expect(out.map((o) => o.card.id)).toEqual(['umngot']);
  });

  it('stops at the end of the route', () => {
    const days = Array.from({ length: 9 }, (_, i) => `2026-11-0${i + 1}`);
    expect(cardsToDeliver(days, [], '2026-11-20')).toHaveLength(6);
  });
});

describe('postcard storage', () => {
  beforeEach(async () => {
    await deleteEverything();
    await completeOnboarding(
      { ageBand: '18-64', goalMl: 2000, goalSource: 'suggested', units: 'ml', cupMl: 240, parentConfirmed: false, vessels: [{ name: 'Glass', ml: 250 }] },
      at('2026-11-08T08:00:00')
    );
  });

  it('a goal day brings a card the next morning; over-goal drinking earns nothing more', async () => {
    await addLog(1000, null, at('2026-11-08T09:00:00'));
    await addLog(1000, null, at('2026-11-08T13:00:00'));
    await addLog(1000, null, at('2026-11-08T17:00:00')); // past the goal
    expect(await deliverPostcards(at('2026-11-08T21:00:00'))).toEqual([]);
    const fresh = await deliverPostcards(at('2026-11-09T07:00:00'));
    expect(fresh.map((c) => c.id)).toEqual(['loktak']);
    expect(await deliverPostcards(at('2026-11-09T08:00:00'))).toEqual([]);
    expect(await db.postcards.count()).toBe(1);
  });

  it('a day under the goal brings nothing, and is never mentioned', async () => {
    await addLog(1500, null, at('2026-11-08T09:00:00'));
    expect(await deliverPostcards(at('2026-11-09T07:00:00'))).toEqual([]);
  });

  it('a delivered card is never taken back, even if a log is later deleted', async () => {
    const log = await addLog(2000, null, at('2026-11-08T09:00:00'));
    await deliverPostcards(at('2026-11-09T07:00:00'));
    await removeLog(log.id);
    await deliverPostcards(at('2026-11-09T08:00:00'));
    expect(await db.postcards.get('loktak')).toBeTruthy();
  });

  it('remembers when a message was read, and exports cards', async () => {
    await addLog(2000, null, at('2026-11-08T09:00:00'));
    await deliverPostcards(at('2026-11-09T07:00:00'));
    await markPostcardRead('loktak', at('2026-11-09T07:05:00'));
    expect((await db.postcards.get('loktak'))?.readAt).toBe(at('2026-11-09T07:05:00').toISOString());
    const file = await exportAll();
    expect(file.format).toBe(3);
    expect(file.postcards).toHaveLength(1);
  });
});
