export interface Progress {
  totalMl: number;
  goalMl: number;
  /** 0–100, capped: drinking past the goal never shows more than 100%. */
  percent: number;
  /** 0–1 for the bottle fill, capped at 1. */
  fill: number;
  remainingMl: number;
  /** Rounded up, in the person's usual glass size. */
  glassesToGo: number;
  reached: boolean;
}

/** The glass used for "about N glasses to go". */
export const STANDARD_GLASS_ML = 250;

export function progress(totalMl: number, goalMl: number, glassMl = STANDARD_GLASS_ML): Progress {
  const safeGoal = Math.max(1, goalMl);
  const fill = Math.min(1, Math.max(0, totalMl / safeGoal));
  const remainingMl = Math.max(0, safeGoal - totalMl);
  return {
    totalMl,
    goalMl: safeGoal,
    percent: Math.floor(fill * 100),
    fill,
    remainingMl,
    glassesToGo: remainingMl === 0 ? 0 : Math.ceil(remainingMl / Math.max(50, glassMl)),
    reached: totalMl >= safeGoal
  };
}

export const MILESTONES = [25, 50, 75, 100] as const;

/** The milestone crossed by going from `before` to `after` ml, if any (highest wins). */
export function crossedMilestone(beforeMl: number, afterMl: number, goalMl: number): number | null {
  let hit: number | null = null;
  for (const m of MILESTONES) {
    const line = (goalMl * m) / 100;
    if (beforeMl < line && afterMl >= line) hit = m;
  }
  return hit;
}
