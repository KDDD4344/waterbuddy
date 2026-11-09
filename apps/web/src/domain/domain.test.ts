import { describe, expect, it } from 'vitest';
import { addDays, dayKey, dayLabel, lastNDays, msUntilNextMidnight } from './dates';
import { AGE_BANDS, band, clampGoal, goalWarning } from './goals';
import { crossedMilestone, progress } from './progress';
import { mlInWindow, shouldShowSipGuard } from './guards';
import { formatAmount, formatBig, toMl } from './units';

describe('dates', () => {
  it('uses the local calendar date in the given time zone', () => {
    const d = new Date('2026-11-09T20:00:00Z'); // 01:30 on 10 Nov in India
    expect(dayKey(d, 'Asia/Kolkata')).toBe('2026-11-10');
    expect(dayKey(d, 'Europe/London')).toBe('2026-11-09');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(lastNDays('2026-11-09', 3)).toEqual(['2026-11-09', '2026-11-08', '2026-11-07']);
  });

  it('labels today and yesterday in words', () => {
    expect(dayLabel('2026-11-09', '2026-11-09')).toBe('Today');
    expect(dayLabel('2026-11-08', '2026-11-09')).toBe('Yesterday');
    expect(dayLabel('2026-11-02', '2026-11-09')).toMatch(/2 Nov/);
  });

  it('counts down to the next local midnight', () => {
    const now = new Date(2026, 10, 9, 23, 59, 0);
    expect(msUntilNextMidnight(now)).toBe(60_000);
  });
});

describe('goals', () => {
  it('has a sourced suggestion for every age band', () => {
    expect(AGE_BANDS.map((b) => b.id)).toEqual(['4-8', '9-13', '14-17', '18-64', '65+']);
    for (const b of AGE_BANDS) {
      expect(b.sources.length).toBeGreaterThan(0);
      expect(b.suggestedMl).toBeGreaterThanOrEqual(b.rangeMl[0]);
      expect(b.suggestedMl).toBeLessThanOrEqual(b.rangeMl[1]);
    }
  });

  it('marks children as parent set-up', () => {
    expect(band('4-8').parentSetup).toBe(true);
    expect(band('18-64').parentSetup).toBe(false);
  });

  it('warns outside the sensible range but never blocks', () => {
    expect(goalWarning('18-64', 2000)).toBeNull();
    expect(goalWarning('18-64', 5000)).toMatch(/a lot more/);
    expect(goalWarning('18-64', 800)).toMatch(/lower/);
  });

  it('rounds goals to 50 ml and keeps them in hard limits', () => {
    expect(clampGoal(1987)).toBe(2000);
    expect(clampGoal(20)).toBe(500);
    expect(clampGoal(99999)).toBe(5000);
  });
});

describe('progress', () => {
  it('reports glasses to go in the person’s glass size', () => {
    const p = progress(1250, 2000, 250);
    expect(p.percent).toBe(62);
    expect(p.remainingMl).toBe(750);
    expect(p.glassesToGo).toBe(3);
    expect(p.reached).toBe(false);
  });

  it('never shows more than 100% (rule 1: no reward past the goal)', () => {
    const p = progress(3000, 2000);
    expect(p.percent).toBe(100);
    expect(p.fill).toBe(1);
    expect(p.glassesToGo).toBe(0);
    expect(p.reached).toBe(true);
  });

  it('finds the highest milestone crossed by one log', () => {
    expect(crossedMilestone(900, 1100, 2000)).toBe(50);
    expect(crossedMilestone(400, 1600, 2000)).toBe(75);
    expect(crossedMilestone(2000, 2250, 2000)).toBeNull();
    expect(crossedMilestone(1900, 2000, 2000)).toBe(100);
  });
});

describe('sip guard', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();

  it('only counts the last hour', () => {
    expect(mlInWindow([{ ml: 500, at: at(10) }, { ml: 500, at: at(90) }], now)).toBe(500);
  });

  it('shows above one litre in an hour', () => {
    expect(shouldShowSipGuard([{ ml: 1000, at: at(5) }], now)).toBe(false);
    expect(shouldShowSipGuard([{ ml: 1000, at: at(5) }, { ml: 250, at: at(30) }], now)).toBe(true);
  });
});

describe('units', () => {
  it('formats amounts', () => {
    expect(formatAmount(250, 'ml')).toBe('250 ml');
    expect(formatAmount(1000, 'ml')).toBe('1 L');
    expect(formatAmount(250, 'cups', 250)).toBe('1 cup');
    expect(formatAmount(500, 'cups', 250)).toBe('2 cups');
    expect(formatAmount(250, 'oz')).toBe('8.5 fl oz');
    expect(formatBig(1250, 'ml')).toEqual({ value: '1,250', unit: 'ml' });
  });

  it('converts typed values back to millilitres', () => {
    expect(toMl(2, 'cups', 200)).toBe(400);
    expect(toMl(8, 'oz')).toBe(237);
    expect(toMl(Number.NaN, 'ml')).toBe(0);
  });
});
