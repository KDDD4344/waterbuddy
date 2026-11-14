import { useId } from 'react';
import type { Profile } from '../data/db';
import { updateProfile } from '../data/repo';
import { DEFAULT_WAKE, quietHours } from '../domain/reminders';
import { clockLabel, DEFAULT_BEDTIME } from '../domain/voyage';

const valid = (t: string) => /^\d{2}:\d{2}$/.test(t);

/**
 * When the person's day starts and ends. Last call is two hours before sleep, so the app
 * never nudges anyone to drink late; reminders only fall between waking and last call.
 */
export function DaySettings({ profile }: { profile: Profile }) {
  const id = useId();
  const wake = profile.wake ?? DEFAULT_WAKE;
  const bedtime = profile.bedtime ?? DEFAULT_BEDTIME;
  const quiet = quietHours(bedtime, wake);
  return (
    <section className="group" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Your day</h2>
      <label className="setting">
        <span className="setting-label">I usually wake up at</span>
        <input
          type="time"
          defaultValue={wake}
          onBlur={(e) => valid(e.target.value) && void updateProfile({ wake: e.target.value })}
        />
      </label>
      <label className="setting">
        <span className="setting-label">I usually go to sleep at</span>
        <input
          type="time"
          defaultValue={bedtime}
          onBlur={(e) => valid(e.target.value) && void updateProfile({ bedtime: e.target.value })}
        />
      </label>
      <p className="small muted">
        Quiet hours: {clockLabel(quiet.from)} to {clockLabel(quiet.until)}. No reminders then, and Today stops counting
        down at last call ({clockLabel(quiet.from)}), so you&rsquo;re never nudged to drink late.
      </p>
    </section>
  );
}
