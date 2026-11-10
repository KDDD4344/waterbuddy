import { describe, expect, it } from 'vitest';
import { AGE_BANDS } from './goals';
import {
  checkParentAnswer,
  defaultTextSize,
  feedbackAllowed,
  isMinor,
  modeFor,
  needsParentCheck,
  parentQuestion,
  remindersAllowed,
  textSizeOf
} from './modes';
import { summarise } from '../lib/perf';

describe('modes for every age', () => {
  it('maps each age band to a mode', () => {
    expect(AGE_BANDS.map((b) => modeFor(b.id))).toEqual(['kid', 'kid', 'teen', 'adult', 'older']);
  });

  it('treats everyone under 18 as a child (DPDP Act 2023): nothing goes to the server', () => {
    for (const b of AGE_BANDS) {
      const minor = b.id === '4-8' || b.id === '9-13' || b.id === '14-17';
      expect(isMinor(b.id)).toBe(minor);
      expect(remindersAllowed(b.id)).toBe(!minor);
      expect(feedbackAllowed(b.id)).toBe(!minor);
    }
  });

  it('puts a parent check on kid mode only, matching the parent-setup bands', () => {
    for (const b of AGE_BANDS) expect(needsParentCheck(b.id)).toBe(b.parentSetup);
  });

  it('starts kids and older adults on large text, and a chosen size wins', () => {
    expect(defaultTextSize('4-8')).toBe('large');
    expect(defaultTextSize('65+')).toBe('large');
    expect(defaultTextSize('18-64')).toBe('standard');
    expect(textSizeOf({ ageBand: '65+', textSize: 'standard' })).toBe('standard');
    expect(textSizeOf({ ageBand: '14-17' })).toBe('standard');
  });
});

describe('the parent check', () => {
  it('asks a multiplication in words and checks the answer', () => {
    const q = parentQuestion(() => 0);
    expect(q.text).toBe('What is six times three?');
    expect(checkParentAnswer(q, ' 18 ')).toBe(true);
    expect(checkParentAnswer(q, '17')).toBe(false);
    expect(checkParentAnswer(q, '')).toBe(false);
    expect(checkParentAnswer(q, '18.0x')).toBe(false);
  });

  it('never shows digits in the question', () => {
    for (let i = 0; i < 50; i++) {
      const q = parentQuestion();
      expect(q.text).not.toMatch(/\d/);
      expect(q.answer).toBeGreaterThanOrEqual(18);
      expect(q.answer).toBeLessThanOrEqual(108);
    }
  });
});

describe('the performance meter', () => {
  it('summarises frame times', () => {
    const frames = [...Array(95).fill(16), ...Array(5).fill(50)];
    const s = summarise(frames);
    expect(s.fps).toBe(Math.round(100_000 / (95 * 16 + 5 * 50)));
    expect(s.p95).toBe(50);
    expect(s.worst).toBe(50);
    expect(summarise([])).toEqual({ fps: 0, p95: 0, worst: 0 });
  });
});
