import type { DayKey } from './dates';

export interface PeriodSummary {
  /** Days in the period since the person started. */
  days: number;
  /** Days with at least one drink logged. */
  loggedDays: number;
  /** Days the goal (of that day) was met. */
  metDays: number;
  totalMl: number;
  /** Average per day over the days since starting (not only logged days), rounded to 10 ml. */
  averageMl: number;
  best: { day: DayKey; ml: number } | null;
}

/**
 * A week's or a month's summary, counted honestly: every day since the person started
 * counts toward the average (a day with nothing logged isn't skipped), each day is judged
 * against the goal it had at the time, and nothing rewards drinking past the goal.
 */
export function summarize(days: DayKey[], totals: Map<DayKey, number>, goalOn: (d: DayKey) => number): PeriodSummary {
  let totalMl = 0;
  let loggedDays = 0;
  let metDays = 0;
  let best: PeriodSummary['best'] = null;
  for (const d of days) {
    const ml = totals.get(d) ?? 0;
    totalMl += ml;
    if (ml > 0) loggedDays++;
    if (ml >= goalOn(d)) metDays++;
    if (ml > 0 && (!best || ml > best.ml)) best = { day: d, ml };
  }
  const averageMl = days.length ? Math.round(totalMl / days.length / 10) * 10 : 0;
  return { days: days.length, loggedDays, metDays, totalMl, averageMl, best };
}
