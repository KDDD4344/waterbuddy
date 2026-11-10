/**
 * Reminder rules on the phone. They mirror apps/api/app/rules.py, so the app can explain
 * a problem before asking the server.
 */
import { DEFAULT_BEDTIME, lastCallTime } from './voyage';

/** Field task 9's answers, mapped to a time. "I don't want reminders" maps to none. */
export const PREF_TIMES: Record<string, string> = {
  Morning: '09:00',
  'Around lunch': '12:30',
  'Mid-afternoon': '15:30',
  'Early evening': '18:00'
};
export const NO_REMINDERS = "I don't want reminders";
const WINDOW_MIN = 45;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export function suggestedTime(pref?: string): string {
  return (pref && PREF_TIMES[pref]) || '09:00';
}

function lastCallMinutes(bedtime: string): number {
  const m = minutes(lastCallTime(bedtime));
  return m < 4 * 60 ? m + 24 * 60 : m;
}

/** Why a reminder time won't work, or null. */
export function reminderTimeProblem(time: string, bedtime = DEFAULT_BEDTIME): string | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return 'Pick a time.';
  if (minutes(time) < 6 * 60) return 'Reminders start from 6 am.';
  if (minutes(time) + WINDOW_MIN > lastCallMinutes(bedtime)) return 'That’s too close to last call. Pick an earlier time.';
  return null;
}

/**
 * What a reminder says. Gentle, never about what someone hasn't done, never a diagnosis
 * (safety rule 6), never a streak.
 */
export function reminderText(cue: string | null, day: string): { title: string; body: string } {
  const lines = [
    'Pip’s bottle has room for a glass whenever you’re ready.',
    'A good moment for a glass of water?',
    'Pip is ready for a refill when you are.'
  ];
  const n = Number(day.replace(/-/g, '')) % (cue ? lines.length + 1 : lines.length);
  return { title: 'WaterBuddy', body: cue && n === lines.length ? `Your cue: ${cue}` : lines[n]! };
}

/** A reminder that arrives after the goal or after last call is not shown (safety rules 2 and 3). */
export function staySilent({ goalMet, afterLastCall }: { goalMet: boolean; afterLastCall: boolean }): boolean {
  return goalMet || afterLastCall;
}
