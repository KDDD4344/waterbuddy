/**
 * The night voyage (Phase 4). A day whose goal is met earns one voyage: Pip corks the
 * bottle, sails overnight, and a postcard washes up the next morning. Postcards come in
 * route order and are never taken back. Drinking past the goal earns nothing more
 * (safety rule 1), and missed days are never mentioned (rule 9).
 */
import type { DayKey } from './dates';

export type SceneId = 'floating-islands' | 'clear-river' | 'river-island' | 'mangroves' | 'lagoon' | 'backwaters';

export interface Source {
  title: string;
  url: string;
  supports?: string;
}

export interface Postcard {
  id: string;
  route: string;
  number: number;
  place: string;
  region: string;
  coordinates: string;
  scene: SceneId;
  message: string;
  fieldFind: { name: string; note: string };
  alt: string;
  sources: Source[];
  /** False until a named reviewer has checked every fact (safety rule 13). */
  reviewed: boolean;
  /** A painted illustration exists (built by tools/build_art.py); otherwise a drawn placeholder. */
  art: boolean;
}

type RawCard = {
  id: string;
  route: string;
  number: number;
  place: string;
  region: string;
  coordinates: string;
  scene: string;
  message: string;
  field_find: { name: string; note: string };
  alt: string;
  sources: Source[];
  review: { status: string };
  art?: boolean | null;
};

const files = import.meta.glob<RawCard>('../../../../content/postcards/route-1/*.json', { eager: true, import: 'default' });

export const ROUTE_1: Postcard[] = Object.values(files)
  .map((c) => ({
    id: c.id,
    route: c.route,
    number: c.number,
    place: c.place,
    region: c.region,
    coordinates: c.coordinates,
    scene: c.scene as SceneId,
    message: c.message,
    fieldFind: c.field_find,
    alt: c.alt,
    sources: c.sources,
    reviewed: c.review.status === 'approved',
    art: c.art === true
  }))
  .sort((a, b) => a.number - b.number);

export const ROUTE_NAME = 'Route I · Waters of India';

export function postcardById(id: string): Postcard | undefined {
  return ROUTE_1.find((c) => c.id === id);
}

// --- Last call (safety rule 3) ---

export const DEFAULT_BEDTIME = '22:30';
const LAST_CALL_BEFORE_MIN = 120;
/** The night runs until 4 am; after that it is a new morning. */
const NIGHT_ENDS_MIN = 4 * 60;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Minutes after midnight, counting the small hours as part of the evening before. */
function eveningMinutes(min: number): number {
  return min < NIGHT_ENDS_MIN ? min + 24 * 60 : min;
}

/** "HH:MM" two hours before bedtime. */
export function lastCallTime(bedtime = DEFAULT_BEDTIME): string {
  const m = (minutes(bedtime) - LAST_CALL_BEFORE_MIN + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** True from last call until 4 am. Pip stops asking for water in this window. */
export function isAfterLastCall(now: Date, bedtime = DEFAULT_BEDTIME): boolean {
  const lastCall = eveningMinutes(minutes(lastCallTime(bedtime)));
  const nowMin = eveningMinutes(now.getHours() * 60 + now.getMinutes());
  // A bedtime in the small hours puts last call after midnight too.
  return nowMin >= Math.max(lastCall, 12 * 60);
}

/** "8:30 pm" style label for a "HH:MM" time. */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
}

// --- The scene's time of day ---

export type Phase = 'day' | 'evening' | 'night' | 'morning';

/**
 * - morning: a postcard is waiting to be read
 * - night: after last call, or the goal is met and it is dark out (from 7 pm)
 * - evening: the goal is met earlier in the day; the bottle is corked and ready to sail
 * - day: everything else
 */
export function scenePhase(now: Date, { goalMet, messageWaiting, bedtime }: { goalMet: boolean; messageWaiting: boolean; bedtime?: string }): Phase {
  if (messageWaiting) return 'morning';
  const nowMin = eveningMinutes(now.getHours() * 60 + now.getMinutes());
  if (isAfterLastCall(now, bedtime) || (goalMet && nowMin >= 19 * 60)) return 'night';
  if (goalMet) return 'evening';
  return 'day';
}

// --- Delivery ---

export interface DeliveryLike {
  id: string;
  day: DayKey;
}

/**
 * Which cards to deliver now. Every goal day before today that has no card yet earns the
 * next card on the route, oldest day first. Today's voyage hasn't sailed yet.
 */
export function cardsToDeliver(goalDays: DayKey[], delivered: DeliveryLike[], today: DayKey, route: Postcard[] = ROUTE_1): { day: DayKey; card: Postcard }[] {
  const sailed = new Set(delivered.map((d) => d.day));
  const owned = new Set(delivered.map((d) => d.id));
  const remaining = route.filter((c) => !owned.has(c.id));
  const days = [...new Set(goalDays)].filter((d) => d < today && !sailed.has(d)).sort();
  return days.slice(0, remaining.length).map((day, i) => ({ day, card: remaining[i]! }));
}
