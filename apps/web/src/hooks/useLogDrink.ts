import { useRef } from 'react';
import type { Profile, Vessel } from '../data/db';
import { addLog, logsForDay, removeLog } from '../data/repo';
import { crossedMilestone } from '../domain/progress';
import { formatAmount } from '../domain/units';
import { dayKey } from '../domain/dates';
import { useToast } from '../ui/toast';
import { tidepoolBus } from '../three/bus';

/**
 * Logging a drink, shared by Today and the spring (Atlas):
 * - exactly the amount chosen, read against the stored total (not a stale screen value),
 * - an accidental double tap (the same amount again within a moment) logs once,
 * - Ripple's pour starts at once; storage follows a few milliseconds later,
 * - the goal is celebrated once a day, even if that drink is undone and logged again,
 * - every drink can be undone from its toast, and Undo removes exactly that drink.
 */
export function useLogDrink(profile: Profile, onMilestone?: (pct: number) => void) {
  const toast = useToast();
  const last = useRef({ ml: 0, at: 0 });
  const fmt = (ml: number) => formatAmount(ml, profile.units, profile.cupMl);

  /** `clickCount` is the click event's `detail`: 2 or more means the second tap of a double tap. */
  return async function log(ml: number, vessel?: Vessel, clickCount = 1): Promise<boolean> {
    if (clickCount >= 2) return false;
    // Backup for browsers that don't count taps: the same amount again within 0.6 s.
    const tap = performance.now();
    const dt = tap - last.current.at;
    if (last.current.ml === ml && dt > 0 && dt < 600) return false;
    last.current = { ml, at: tap };
    const day = dayKey(new Date());
    const before = (await logsForDay(day)).reduce((s, l) => s + l.ml, 0);
    const after = before + ml;
    const goal = profile.goalMl;
    const milestone = before < goal ? crossedMilestone(before, after, goal) : null;
    let celebrate = false;
    if (before < goal && after >= goal) {
      const key = `wb-celebrated-${day}`;
      try {
        celebrate = localStorage.getItem(key) === null;
        localStorage.setItem(key, '1');
      } catch {
        celebrate = true;
      }
    }
    tidepoolBus.emit({
      type: 'pour',
      event: {
        ml,
        fromFill: Math.min(1, before / goal),
        toFill: Math.min(1, after / goal),
        milestone,
        overGoal: before >= goal,
        fromMl: before,
        toMl: after,
        goalMl: goal,
        celebrate
      }
    });
    const entry = await addLog(ml, vessel?.id ?? null);
    if (milestone) onMilestone?.(milestone);
    const status =
      before >= goal
        ? `${fmt(ml)} logged. Today's goal was already met.`
        : after >= goal
          ? `${fmt(ml)} logged. Goal reached for today.`
          : `${fmt(ml)} logged. ${fmt(after)} of ${fmt(goal)}.`;
    toast({
      text: status,
      action: {
        label: 'Undo',
        run: () => {
          tidepoolBus.emit({ type: 'undo', toFill: Math.min(1, before / goal) });
          void removeLog(entry.id);
        }
      }
    });
    return true;
  };
}
