import { useEffect, useId, useState } from 'react';
import type { Profile } from '../data/db';
import { updateProfile } from '../data/repo';
import { NO_REMINDERS, reminderTimeProblem, suggestedTime } from '../domain/reminders';
import { clockLabel, DEFAULT_BEDTIME, lastCallTime } from '../domain/voyage';
import { disableReminders, enableReminders, newDeviceId, pushSupport, reminderPaused } from '../lib/push';
import { useInstallPrompt } from '../lib/install';
import { isInstalled, isIos } from '../lib/pwa';
import { useToast } from '../ui/toast';

/** One gentle reminder a day, set from the You screen (Phase 6). */
export function RemindersSettings({ profile }: { profile: Profile }) {
  const toast = useToast();
  const support = pushSupport();
  const r = profile.reminders;
  const bedtime = profile.bedtime ?? DEFAULT_BEDTIME;
  const [time, setTime] = useState(r?.time ?? suggestedTime(profile.reminderPref));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const timeId = useId();
  const problem = reminderTimeProblem(time, bedtime);

  useEffect(() => {
    if (r?.on) void reminderPaused(r.id).then(setPaused);
  }, [r?.on, r?.id]);

  const turnOn = async () => {
    if (problem) return;
    setBusy(true);
    setError(null);
    const id = r?.id ?? newDeviceId();
    const res = await enableReminders({ id, time, bedtime });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    await updateProfile({ reminders: { on: true, time, id } });
    setPaused(false);
    toast({ text: `Daily reminder set for ${clockLabel(time)}.` });
  };

  const turnOff = async () => {
    if (!r) return;
    setBusy(true);
    await disableReminders(r.id);
    await updateProfile({ reminders: { ...r, on: false } });
    setBusy(false);
    toast({ text: 'Reminders off. Nothing is stored on the server now.' });
  };

  return (
    <section className="group" aria-labelledby="g-remind">
      <h2 id="g-remind">Reminders</h2>
      <p className="small muted">
        One gentle reminder a day, at most. It never comes once your bottle is full, or after last call ({clockLabel(lastCallTime(bedtime))}).
      </p>

      {support === 'no-server' && <p className="note">Reminders need the WaterBuddy server, which isn&rsquo;t connected in this version of the app.</p>}
      {support === 'unsupported' && <p className="note">This browser can&rsquo;t show reminders. Logging and everything else still work.</p>}
      {support === 'needs-install' && (
        <p className="note">On iPhone and iPad, reminders work once WaterBuddy is on your Home Screen. See &ldquo;Install WaterBuddy&rdquo; below.</p>
      )}

      {support === 'supported' && (
        <>
          {r?.on && paused && (
            <div className="note calm" role="status">
              <p>Paused, because the last few reminders weren&rsquo;t opened. Turn it back on whenever it would help.</p>
              <button type="button" className="btn ghost" onClick={turnOn} disabled={busy}>
                Turn back on
              </button>
            </div>
          )}
          {!r?.on && profile.reminderPref === NO_REMINDERS && <p className="small muted">You said you&rsquo;d rather not have reminders. That&rsquo;s fine; this stays off unless you turn it on.</p>}
          <div className="field">
            <label htmlFor={timeId} className="setting-label">
              Remind me at
            </label>
            <input id={timeId} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-describedby={problem ? `${timeId}-err` : undefined} />
            {problem && (
              <p id={`${timeId}-err`} className="error" role="alert">
                {problem}
              </p>
            )}
          </div>
          <div className="row">
            {r?.on ? (
              <>
                <button type="button" className="btn ghost" onClick={turnOff} disabled={busy}>
                  Turn off
                </button>
                <button type="button" className="btn primary grow" onClick={turnOn} disabled={busy || !!problem || time === r.time}>
                  Save time
                </button>
              </>
            ) : (
              <button type="button" className="btn primary grow" onClick={turnOn} disabled={busy || !!problem}>
                Turn on daily reminder
              </button>
            )}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="small muted">
            To send it, the WaterBuddy server keeps your reminder time, time zone, bedtime and whether today&rsquo;s goal is met. Never your drinks.
          </p>
        </>
      )}
    </section>
  );
}

/** How to put WaterBuddy on the Home Screen, for each kind of phone. */
export function InstallSettings() {
  const install = useInstallPrompt();
  const installed = isInstalled();
  return (
    <section className="group" aria-labelledby="g-install">
      <h2 id="g-install">Install WaterBuddy</h2>
      {installed ? (
        <p className="small muted">Installed. WaterBuddy opens from your Home Screen and works offline.</p>
      ) : install ? (
        <>
          <p className="small muted">Add WaterBuddy to your Home Screen so it opens like an app and works offline.</p>
          <button type="button" className="btn primary" onClick={() => void install()}>
            Install WaterBuddy
          </button>
        </>
      ) : isIos() ? (
        <ol className="steps">
          <li>
            Open this page in <b>Safari</b>.
          </li>
          <li>
            Tap <b>Share</b> (the square with an arrow).
          </li>
          <li>
            Choose <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
          <li>Open WaterBuddy from the new icon to turn on reminders.</li>
        </ol>
      ) : (
        <p className="small muted">Use your browser&rsquo;s menu and choose &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.</p>
      )}
    </section>
  );
}
