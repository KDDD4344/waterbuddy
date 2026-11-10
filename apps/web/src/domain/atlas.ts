/**
 * The Waterverse (Phase 5): Route I as an archipelago. Each postcard lifts the fog from
 * its island for good. Missed days never bring the fog back (safety rule 9).
 */
import { ROUTE_1, type Postcard } from './voyage';

export interface Island {
  card: Postcard;
  /** Position on the sea (world units). Laid out in each place's real compass direction, squeezed to fit. */
  x: number;
  z: number;
  radius: number;
}

/** Where Pip's bottle waits before the first voyage. */
export const HARBOUR = { x: 18, z: -3 };

// Projected from real latitude and longitude, then pulled in so the route fits a phone screen.
const LAYOUT: Record<string, { x: number; z: number; radius: number }> = {
  loktak: { x: 13.5, z: -9.5, radius: 2.2 },
  umngot: { x: 6.5, z: -13, radius: 2 },
  majuli: { x: 15, z: -19, radius: 2.4 },
  sundarbans: { x: 1.5, z: -3.5, radius: 2.5 },
  chilika: { x: -6.5, z: 3, radius: 2.2 },
  vembanad: { x: -14, z: 12.5, radius: 2.3 }
};

export const ISLANDS: Island[] = ROUTE_1.map((card) => ({ card, ...(LAYOUT[card.id] ?? { x: 0, z: 0, radius: 2 }) }));

export type IslandStatus = 'clear' | 'arriving' | 'next' | 'fog';

export interface AtlasState {
  /** Per island, in route order. */
  status: IslandStatus[];
  /** Islands out of the fog, including any arriving now. */
  clearCount: number;
  /** Route indexes Pip still has to sail to and reveal, in order (new since the last visit). */
  arrivals: number[];
  /** Where the bottle starts this visit: -1 for the harbour, else an island index. */
  from: number;
}

/**
 * `received` is the set of postcard ids delivered so far; `seen` is how many islands the
 * person has already watched clear. Cards arrive in route order, so the first N are clear.
 */
export function atlasState(received: Set<string>, seen: number): AtlasState {
  const clearCount = ISLANDS.filter((i) => received.has(i.card.id)).length;
  const shown = Math.min(seen, clearCount);
  const status = ISLANDS.map((_, i): IslandStatus => (i < shown ? 'clear' : i < clearCount ? 'arriving' : i === clearCount ? 'next' : 'fog'));
  const arrivals = status.flatMap((s, i) => (s === 'arriving' ? [i] : []));
  return { status, clearCount, arrivals, from: shown - 1 };
}

/** Plain words for the list and the island card. Never mentions missed days. */
export function statusLine(s: IslandStatus): string {
  if (s === 'clear' || s === 'arriving') return 'Out of the fog';
  if (s === 'next') return 'Next on the route';
  return 'Still in the fog';
}
