import { describe, expect, it } from 'vitest';
import { summarize } from './summary';

describe('week and month summaries', () => {
  const days = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'];
  it('averages over every day since starting, not only logged days', () => {
    const s = summarize(
      days,
      new Map([
        ['2026-11-08', 2000],
        ['2026-11-10', 1000]
      ]),
      () => 2000
    );
    expect(s.averageMl).toBe(750);
    expect(s.loggedDays).toBe(2);
    expect(s.metDays).toBe(1);
    expect(s.totalMl).toBe(3000);
    expect(s.best).toEqual({ day: '2026-11-08', ml: 2000 });
  });
  it('judges each day against the goal it had then', () => {
    const goal = (d: string) => (d < '2026-11-10' ? 1500 : 2500);
    const s = summarize(days, new Map(days.map((d) => [d, 2000])), goal);
    expect(s.metDays).toBe(2);
  });
  it('an empty period is all zeros, not an error', () => {
    expect(summarize([], new Map(), () => 2000)).toMatchObject({ days: 0, averageMl: 0, best: null });
  });
});
