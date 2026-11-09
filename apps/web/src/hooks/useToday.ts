import { useEffect, useState } from 'react';
import { dayKey, msUntilNextMidnight, type DayKey } from '../domain/dates';

/**
 * The current local day. Rolls over at midnight while the app is open, and re-checks
 * whenever the app comes back to the foreground (phones pause timers in the background).
 */
export function useToday(): DayKey {
  const [today, setToday] = useState<DayKey>(() => dayKey(new Date()));

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => setToday(dayKey(new Date()));
    const schedule = () => {
      timer = window.setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextMidnight(new Date()) + 500);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return today;
}
