/**
 * One gentle hydration tip a day. General information, not medical advice (safety rule 6):
 * nothing here tells anyone to drink more than they need, and the tips point to a doctor
 * whenever health changes the picture.
 */
import type { DayKey } from './dates';

export const TIPS: string[] = [
  'Water in food counts too: fruit, vegetables, dal, curd and soups all add to your day.',
  'Feeling thirsty is a fine signal to drink. There’s no need to force water down when you aren’t.',
  'Hot days and exercise raise how much you need. Sip a little more then, and have a glass after a workout.',
  'Keep a bottle where you can see it: on your desk, by your bed or in your bag.',
  'Pale straw-coloured urine usually means you’re drinking enough. Very dark can mean you need more.',
  'Small sips through the day are easier on your body than a lot at once.',
  'Tea, coffee and milk count toward your fluids as well. Plain water is the easiest everyday choice.',
  'More isn’t better. Once you’ve reached your goal for the day, you’re done.',
  'A glass with each meal is an easy habit to hang on to.',
  'Children and older people often feel less thirsty. Offering water with meals and snacks helps.',
  'If a doctor has given you a fluid limit, use that as your goal. It matters more than any app’s suggestion.',
  'Sugary and energy drinks add fluid but also sugar. Water is the everyday default.',
  'Water doesn’t need to be cold. Drink it however you like it.',
  'Feeling unwell with vomiting, diarrhoea or fever? Small, frequent sips help; see a doctor if it lasts.'
];

/** The same tip all day, the next one tomorrow. */
export function tipFor(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const n = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return TIPS[(((Number.isFinite(n) ? n : 0) % TIPS.length) + TIPS.length) % TIPS.length]!;
}
