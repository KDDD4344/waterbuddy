import goalsData from '../../../../content/goals.json';

export type AgeBandId = '4-8' | '9-13' | '14-17' | '18-64' | '65+';

export interface AgeBand {
  id: AgeBandId;
  label: string;
  suggestedMl: number;
  rangeMl: [number, number];
  parentSetup: boolean;
  why: string;
  sources: { title: string; url: string }[];
}

type RawBand = (typeof goalsData.bands)[number];

const sourcesById = new Map(goalsData.sources.map((s) => [s.id, { title: s.title, url: s.url }]));

function toBand(b: RawBand): AgeBand {
  return {
    id: b.id as AgeBandId,
    label: b.label,
    suggestedMl: b.suggested_ml,
    rangeMl: [b.range_ml[0] ?? 0, b.range_ml[1] ?? 0],
    parentSetup: b.parent_setup,
    why: b.why,
    sources: b.source_ids.map((id) => sourcesById.get(id)).filter((s): s is { title: string; url: string } => !!s)
  };
}

export const AGE_BANDS: AgeBand[] = goalsData.bands.map(toBand);
export const MEDICAL_NOTE: string = goalsData.medical_note;
export const FOOD_NOTE: string = goalsData.food_share_note;

/** Hard limits for any goal entry, whatever the age band. */
export const GOAL_MIN_ML = 500;
export const GOAL_MAX_ML = 5000;

export function band(id: AgeBandId): AgeBand {
  const b = AGE_BANDS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown age band ${id}`);
  return b;
}

/**
 * Safety rule 5 (goal guard): goals outside the band's sensible range need an explicit
 * confirmation. Returns the message to show, or null when the goal is in range.
 */
export function goalWarning(id: AgeBandId, ml: number): string | null {
  const [lo, hi] = band(id).rangeMl;
  if (ml < lo) return `That's lower than usual for ages ${band(id).label}. If a doctor set this amount, that's fine.`;
  if (ml > hi)
    return `That's a lot more than usual for ages ${band(id).label}. Drinking much more than you need isn't healthier, and very large amounts can be harmful.`;
  return null;
}

export function clampGoal(ml: number): number {
  return Math.min(GOAL_MAX_ML, Math.max(GOAL_MIN_ML, Math.round(ml / 50) * 50));
}
