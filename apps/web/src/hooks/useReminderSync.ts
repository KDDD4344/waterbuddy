import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Profile } from '../data/db';
import { goalOn } from '../data/repo';
import { useToday } from './useToday';
import { syncToday } from '../lib/push';

/**
 * Keeps the reminder server's one flag up to date: is today's goal met? That is all it
 * learns (decision D-009). Retries when the app comes back to the front.
 */
export function useReminderSync(profile: Profile) {
  const today = useToday();
  const r = profile.reminders;
  const met = useLiveQuery(async () => {
    const [logs, goals] = await Promise.all([db.logs.where('day').equals(today).toArray(), db.goals.toArray()]);
    const total = logs.filter((l) => !l.deletedAt).reduce((s, l) => s + l.ml, 0);
    return total >= goalOn(today, goals, profile.goalMl);
  }, [today, profile.goalMl]);
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!r?.on || met === undefined) return;
    const key = `${r.id}|${today}|${met}`;
    const push = () => {
      if (sent.current === key) return;
      void syncToday(r.id, today, met).then((ok) => {
        if (ok) sent.current = key;
      });
    };
    push();
    const onVisible = () => document.visibilityState === 'visible' && push();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [r?.on, r?.id, today, met]);
}
