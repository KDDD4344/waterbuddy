// Safety rule 4 (sip, don't rush). The threshold is a placeholder until the health reviewer
// confirms it; keep it in one place so changing it is a one-line edit.

export const SIP_GUARD_ML = 1000;
export const SIP_GUARD_WINDOW_MS = 60 * 60 * 1000;

export interface TimedAmount {
  ml: number;
  at: string; // ISO timestamp
}

export function mlInWindow(logs: TimedAmount[], now: Date, windowMs = SIP_GUARD_WINDOW_MS): number {
  const from = now.getTime() - windowMs;
  return logs.reduce((sum, l) => {
    const t = Date.parse(l.at);
    return t > from && t <= now.getTime() ? sum + l.ml : sum;
  }, 0);
}

export function shouldShowSipGuard(logs: TimedAmount[], now: Date): boolean {
  return mlInWindow(logs, now) > SIP_GUARD_ML;
}

/** Single-entry sanity limit, mostly to catch typos like 25000 instead of 250. */
export const MAX_SINGLE_LOG_ML = 2000;
