import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Profile } from '../data/db';
import { clearDay, deleteEverything, exportAll, restoreLogs, saveVessels, setGoal, updateProfile } from '../data/repo';
import { AGE_BANDS, band, goalWarning, type AgeBandId } from '../domain/goals';
import { DEFAULT_CUP_ML, formatAmount, type Units } from '../domain/units';
import { useToday } from '../hooks/useToday';
import { useToast } from '../ui/toast';
import { Sheet } from '../ui/Sheet';
import { GoalPicker } from '../ui/GoalPicker';
import { getApiHealth, type ApiHealth } from '../lib/api';
import { useOfflineReady } from '../lib/offline';
import { isInstalled, isIos } from '../lib/pwa';
import { disableReminders } from '../lib/push';
import { InstallSettings, RemindersSettings } from './RemindersSettings';
import { DaySettings } from './DaySettings';
import { Converter } from '../components/Converter';
import { PrivacySheet } from './Privacy';
import { useParentGate } from '../ui/useParentGate';
import { feedbackAllowed, textSizeOf, type TextSize } from '../domain/modes';

export function You({ profile }: { profile: Profile }) {
  const today = useToday();
  const toast = useToast();
  const vessels = useLiveQuery(() => db.vessels.orderBy('order').toArray(), []);
  const [goalOpen, setGoalOpen] = useState(false);
  const [vesselsOpen, setVesselsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const guard = useParentGate();
  const feedbackUrl = import.meta.env.VITE_FEEDBACK_URL;
  const fmt = (ml: number) => formatAmount(ml, profile.units, profile.cupMl);
  const b = band(profile.ageBand);

  const download = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `waterbuddy-${today}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ text: 'Your data was saved as a file.' });
  };

  return (
    <main className="screen you">
      <p className="kicker">Settings</p>
      <h1 className="title">You</h1>

      <section className="group" aria-labelledby="g-goal">
        <h2 id="g-goal">Daily goal</h2>
        <div className="setting">
          <div>
            <p className="setting-value">{fmt(profile.goalMl)}</p>
            <p className="small muted">
              {profile.goalSource === 'suggested' ? `Suggested for ages ${b.label}` : `Your own goal. Suggested for ages ${b.label}: ${fmt(b.suggestedMl)}`}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={() => guard(() => setGoalOpen(true), 'Goals for children are set by a grown-up.')}>
            Change
          </button>
        </div>
        <label className="setting">
          <span>
            <span className="setting-label">Age range</span>
            <span className="small muted block">Changing it updates the suggestion, not your goal.</span>
          </span>
          <select
            value={profile.ageBand}
            onChange={(e) => {
              const next = e.target.value as AgeBandId;
              guard(() => void updateProfile({ ageBand: next }), 'The age range changes what WaterBuddy allows.');
            }}
          >
            {AGE_BANDS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="group" aria-labelledby="g-units">
        <h2 id="g-units">Amounts</h2>
        <fieldset className="options">
          <legend className="setting-label">Show amounts in</legend>
          <div className="segmented">
            {(['ml', 'cups', 'oz'] as Units[]).map((u) => (
              <label key={u} className="seg">
                <input type="radio" name="units-settings" value={u} checked={profile.units === u} onChange={() => updateProfile({ units: u })} />
                <span>{u === 'ml' ? 'Millilitres' : u === 'cups' ? 'Cups' : 'Fluid ounces'}</span>
              </label>
            ))}
          </div>
          {profile.units === 'cups' && (
            <label className="ml-field inline">
              <span>One cup is</span>
              <input
                type="number"
                inputMode="numeric"
                min={100}
                max={500}
                step={10}
                defaultValue={profile.cupMl}
                onBlur={(e) => updateProfile({ cupMl: Math.min(500, Math.max(100, Number(e.target.value) || DEFAULT_CUP_ML)) })}
              />
              <span>ml</span>
            </label>
          )}
        </fieldset>
        <div className="setting">
          <div>
            <p className="setting-label">Your vessels</p>
            <p className="small muted">{(vessels ?? []).map((v) => `${v.name} ${formatAmount(v.ml, 'ml')}`).join(' · ')}</p>
          </div>
          <button type="button" className="btn ghost" onClick={() => setVesselsOpen(true)}>
            Edit
          </button>
        </div>
        <Converter cupMl={profile.cupMl} />
      </section>

      <section className="group" aria-labelledby="g-display">
        <h2 id="g-display">Display</h2>
        <label className="setting">
          <span>
            <span className="setting-label">Text size</span>
            <span className="small muted block">Makes every word in WaterBuddy bigger.</span>
          </span>
          <select value={textSizeOf(profile)} onChange={(e) => updateProfile({ textSize: e.target.value as TextSize })}>
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="larger">Larger</option>
          </select>
        </label>
        <label className="setting">
          <span>
            <span className="setting-label">High contrast</span>
            <span className="small muted block">Darker text and lines. Helps in bright sun.</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={profile.contrast === 'high'}
            onChange={(e) => updateProfile({ contrast: e.target.checked ? 'high' : 'standard' })}
          />
        </label>
      </section>

      <section className="group" aria-labelledby="g-pip">
        <h2 id="g-pip">Ripple and the spring</h2>
        <label className="setting">
          <span>
            <span className="setting-label">3D scenes</span>
            <span className="small muted block">Ripple&rsquo;s spring on Today and in Atlas. Turn off to save battery; logging and everything else still work.</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={profile.scene3d !== false}
            onChange={(e) => updateProfile({ scene3d: e.target.checked })}
          />
        </label>
        <label className="setting">
          <span>
            <span className="setting-label">Sounds</span>
            <span className="small muted block">A brook in the background, the pour and splash, a chime per glass and soft plinks when you touch the spring. Off by default.</span>
          </span>
          <input type="checkbox" className="switch" checked={profile.sound === true} onChange={(e) => updateProfile({ sound: e.target.checked })} />
        </label>
        <label className="setting">
          <span>
            <span className="setting-label">Motion</span>
            <span className="small muted block">Less motion keeps Ripple&rsquo;s reactions but drops the jumps, camera moves and spray.</span>
          </span>
          <select
            value={profile.reduceMotion === undefined ? 'system' : profile.reduceMotion ? 'less' : 'full'}
            onChange={(e) => updateProfile({ reduceMotion: e.target.value === 'system' ? undefined : e.target.value === 'less' })}
          >
            <option value="system">Follow my phone</option>
            <option value="full">Full motion</option>
            <option value="less">Less motion</option>
          </select>
        </label>
      </section>

      <DaySettings profile={profile} />
      <RemindersSettings profile={profile} />
      <InstallSettings />

      <section className="group" aria-labelledby="g-data">
        <h2 id="g-data">Your data</h2>
        <p className="small muted">
          Everything is stored only on this phone, in this browser. It doesn&rsquo;t sync to other devices or browsers, and clearing this
          site&rsquo;s data or uninstalling removes it, so download a copy if you want to keep it.
          {profile.reminders?.on ? ' The reminder server keeps only what’s listed under Reminders.' : ''}
        </p>
        <div className="stack">
          <button type="button" className="btn ghost" onClick={() => setClearOpen(true)}>
            Clear today&rsquo;s drinks
          </button>
          <button type="button" className="btn ghost" onClick={() => guard(() => void download(), 'This saves a file from WaterBuddy.')}>
            Download my data
          </button>
          <button type="button" className="btn ghost danger" onClick={() => guard(() => setDeleteOpen(true), 'This deletes everything in WaterBuddy.')}>
            Delete everything
          </button>
          <button type="button" className="btn ghost" onClick={() => setPrivacyOpen(true)}>
            Privacy notice
          </button>
        </div>
      </section>

      {feedbackUrl && feedbackAllowed(profile.ageBand) && (
        <section className="group" aria-labelledby="g-feedback">
          <h2 id="g-feedback">Pilot feedback</h2>
          <p className="small muted">
            Something confusing, broken or slow? Tell us. The form is on another website, and what you type there goes to the WaterBuddy team.
          </p>
          <a className="btn ghost" href={feedbackUrl} target="_blank" rel="noopener noreferrer">
            Send feedback<span className="sr-only"> (opens another website)</span>
          </a>
        </section>
      )}

      <BuildInfo />

      <GoalSheet
        key={goalOpen ? 'goal-open' : 'goal-closed'}
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        profile={profile}
        onSaved={(ml) => toast({ text: `Daily goal set to ${fmt(ml)}.` })}
      />
      <VesselsSheet
        key={vesselsOpen ? 'vessels-open' : 'vessels-closed'}
        open={vesselsOpen}
        onClose={() => setVesselsOpen(false)}
        initial={vessels ?? []}
        onSaved={() => toast({ text: 'Vessels saved.' })}
      />

      <PrivacySheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} />

      <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title="Clear today’s drinks?">
        <div className="sheet-form">
          <p>This removes every drink logged today. You can undo it right after.</p>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setClearOpen(false)}>
              Keep them
            </button>
            <button
              type="button"
              className="btn primary grow"
              onClick={async () => {
                const ids = await clearDay(today);
                setClearOpen(false);
                toast({ text: `Cleared ${ids.length} ${ids.length === 1 ? 'drink' : 'drinks'}.`, action: { label: 'Undo', run: () => void restoreLogs(ids) } });
              }}
            >
              Clear today
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete everything?">
        <div className="sheet-form">
          <p>
            This permanently deletes your goal, vessels and every drink you&rsquo;ve logged from this phone, and turns off reminders on the server. It can&rsquo;t be undone. If you want a
            copy, download your data first.
          </p>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn danger-solid grow"
              onClick={async () => {
                if (profile.reminders?.on) await disableReminders(profile.reminders.id);
                await deleteEverything();
                setDeleteOpen(false);
              }}
            >
              Delete permanently
            </button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}

function GoalSheet({ open, onClose, profile, onSaved }: { open: boolean; onClose: () => void; profile: Profile; onSaved: (ml: number) => void }) {
  // Remounted (via key) each time it opens, so it always starts from the saved goal.
  const [ml, setMl] = useState(profile.goalMl);
  const [confirmed, setConfirmed] = useState(false);
  const blocked = !!goalWarning(profile.ageBand, ml) && !confirmed;
  return (
    <Sheet open={open} onClose={onClose} title="Daily goal">
      <div className="sheet-form">
        <GoalPicker
          bandId={profile.ageBand}
          valueMl={ml}
          onChange={(v) => {
            setMl(v);
            setConfirmed(false);
          }}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
          units={profile.units}
          cupMl={profile.cupMl}
        />
        <button
          type="button"
          className="btn primary"
          disabled={blocked}
          onClick={async () => {
            await setGoal(ml, ml === band(profile.ageBand).suggestedMl ? 'suggested' : 'custom');
            onSaved(ml);
            onClose();
          }}
        >
          Save goal
        </button>
      </div>
    </Sheet>
  );
}

type Draft = { id?: string; name: string; ml: number };

function VesselsSheet({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: Draft[]; onSaved: () => void }) {
  // Remounted (via key) each time it opens, so the draft always starts from saved vessels.
  const [list, setList] = useState<Draft[]>(() => initial.map((v) => ({ id: v.id, name: v.name, ml: v.ml })));
  const valid = list.length > 0 && list.length <= 6 && list.every((v) => v.name.trim() && v.ml >= 10 && v.ml <= 2000);
  return (
    <Sheet open={open} onClose={onClose} title="Your vessels">
      <div className="sheet-form">
        <p className="small muted">Up to six. Each becomes a one-tap button on Today.</p>
        {list.map((v, i) => (
          <div key={v.id ?? `new-${i}`} className="vessel-row">
            <label className="grow">
              <span className="sr-only">Vessel {i + 1} name</span>
              <input type="text" value={v.name} maxLength={24} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            </label>
            <label className="ml-field">
              <span className="sr-only">Vessel {i + 1} size in millilitres</span>
              <input
                type="number"
                inputMode="numeric"
                min={10}
                max={2000}
                step={10}
                value={v.ml}
                onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, ml: Number(e.target.value) || 0 } : x)))}
              />
              <span aria-hidden="true">ml</span>
            </label>
            <button type="button" className="icon-btn" aria-label={`Remove ${v.name || 'vessel'}`} disabled={list.length <= 1} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
        {list.length < 6 && (
          <button type="button" className="link-btn" onClick={() => setList((l) => [...l, { name: 'New vessel', ml: 300 }])}>
            Add a vessel
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={!valid}
          onClick={async () => {
            await saveVessels(list);
            onSaved();
            onClose();
          }}
        >
          Save vessels
        </button>
      </div>
    </Sheet>
  );
}

function BuildInfo() {
  const offline = useOfflineReady();
  const [health, setHealth] = useState<ApiHealth | null>(null);
  useEffect(() => {
    let alive = true;
    getApiHealth().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);
  const installed = isInstalled();
  const api =
    !health ? 'Checking…' : health.state === 'online' ? `Online, version ${health.version}` : health.state === 'not-configured' ? 'Not part of V1 (no background reminders)' : 'Can’t be reached right now, so reminders are off. Everything else works.';
  return (
    <section className="group" aria-labelledby="g-about">
      <h2 id="g-about">About this app</h2>
      <dl className="facts">
        <dt>Installed</dt>
        <dd>{installed ? 'Yes, from your home screen' : isIos() ? 'Not yet: Share, then “Add to Home Screen”' : 'Not yet: use your browser’s Install option'}</dd>
        <dt>Works offline</dt>
        <dd>{offline ? 'Yes' : import.meta.env.DEV ? 'Only in the installed build' : 'Getting ready…'}</dd>
        <dt>Reminder server</dt>
        <dd>{api}</dd>
        <dt>Version</dt>
        <dd>{__APP_VERSION__}</dd>
      </dl>
    </section>
  );
}
