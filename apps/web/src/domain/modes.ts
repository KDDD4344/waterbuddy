/**
 * Every age (Phase 8). The age band picks a mode, and the mode picks sensible defaults.
 * People can change the display defaults; the safety ones they can't.
 *
 * - kid (4 to 13): set up by a parent. Goal, age range, data and links out sit behind a
 *   parent check. No purchases and nothing social (safety rules 10 and 12).
 * - teen (14 to 17): sets up alone, but under 18 is a child in India's DPDP Act, so no
 *   server reminders until a legal check approves a parent-consent method (D-011).
 * - adult (18 to 64): everything.
 * - older (65 and up): larger text by default.
 */
import type { AgeBandId } from './goals';

export type Mode = 'kid' | 'teen' | 'adult' | 'older';
export type TextSize = 'standard' | 'large' | 'larger';
export type Contrast = 'standard' | 'high';

export function modeFor(band: AgeBandId): Mode {
  switch (band) {
    case '4-8':
    case '9-13':
      return 'kid';
    case '14-17':
      return 'teen';
    case '65+':
      return 'older';
    default:
      return 'adult';
  }
}

/** Under 18: a child under India's DPDP Act 2023, section 2(f). */
export function isMinor(band: AgeBandId): boolean {
  const m = modeFor(band);
  return m === 'kid' || m === 'teen';
}

/** A parent check guards settings that a child shouldn't change alone. */
export function needsParentCheck(band: AgeBandId): boolean {
  return modeFor(band) === 'kid';
}

/**
 * Server reminders store a push address, time zone and bedtime. For under-18s that waits
 * for verifiable parental consent (DPDP Rules 2025, rule 10), so it is off for now.
 */
export function remindersAllowed(band: AgeBandId): boolean {
  return !isMinor(band);
}

/** A feedback form is a link to someone else's site, so it is for adults only. */
export function feedbackAllowed(band: AgeBandId): boolean {
  return !isMinor(band);
}

export function defaultTextSize(band: AgeBandId): TextSize {
  const m = modeFor(band);
  return m === 'kid' || m === 'older' ? 'large' : 'standard';
}

export const TEXT_SCALE: Record<TextSize, number> = { standard: 1, large: 1.15, larger: 1.3 };

export function textSizeOf(p: { ageBand: AgeBandId; textSize?: TextSize }): TextSize {
  return p.textSize ?? defaultTextSize(p.ageBand);
}

// --- The parent check ---

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve'
];

export interface ParentQuestion {
  text: string;
  answer: number;
}

/**
 * A sum written in words, which young children can't easily read or work out. It keeps
 * a child from changing settings by tapping around. It is not proof of age, and the docs
 * say so (D-011).
 */
export function parentQuestion(rand: () => number = Math.random): ParentQuestion {
  const a = 6 + Math.floor(rand() * 7); // 6..12
  const b = 3 + Math.floor(rand() * 7); // 3..9
  return { text: `What is ${WORDS[a]} times ${WORDS[b]}?`, answer: a * b };
}

export function checkParentAnswer(q: ParentQuestion, input: string): boolean {
  const n = Number(input.trim());
  return Number.isInteger(n) && n === q.answer;
}
