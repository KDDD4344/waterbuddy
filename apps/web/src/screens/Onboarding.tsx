import { useEffect, useRef, useState } from 'react';
import { AGE_BANDS, band, goalWarning, type AgeBandId } from '../domain/goals';
import { DEFAULT_CUP_ML, type Units } from '../domain/units';
import { completeOnboarding, DEFAULT_VESSELS } from '../data/repo';
import { GoalPicker } from '../ui/GoalPicker';
import { PipInBottle } from '../components/PipInBottle';
import { PrivacySheet } from './Privacy';
import { defaultTextSize, isMinor } from '../domain/modes';

type Step = 'welcome' | 'age' | 'goal' | 'vessels';
const STEPS: Step[] = ['welcome', 'age', 'goal', 'vessels'];

type VesselDraft = { key: string; name: string; ml: number; selected: boolean };

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [ageBand, setAgeBand] = useState<AgeBandId | null>(null);
  const [parentConfirmed, setParentConfirmed] = useState(false);
  const [goalMl, setGoalMl] = useState(2000);
  const [goalConfirmed, setGoalConfirmed] = useState(false);
  const [units, setUnits] = useState<Units>('ml');
  const [cupMl, setCupMl] = useState(DEFAULT_CUP_ML);
  const [vessels, setVessels] = useState<VesselDraft[]>(
    DEFAULT_VESSELS.map((v, i) => ({ key: v.id, name: v.name, ml: v.ml, selected: i < 3 }))
  );
  const [saving, setSaving] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  // Kid and older-adult modes start with larger text, from the moment the range is picked.
  useEffect(() => {
    const root = document.documentElement;
    if (ageBand) root.dataset.text = defaultTextSize(ageBand);
    return () => {
      delete root.dataset.text;
    };
  }, [ageBand]);

  const index = STEPS.indexOf(step);
  const chosenBand = ageBand ? band(ageBand) : null;
  const needsParent = !!chosenBand?.parentSetup;
  const selected = vessels.filter((v) => v.selected && v.name.trim() && v.ml >= 10 && v.ml <= 2000);

  const canNext =
    step === 'welcome' ||
    (step === 'age' && !!ageBand && (!needsParent || parentConfirmed)) ||
    (step === 'goal' && !!ageBand && (!goalWarning(ageBand, goalMl) || goalConfirmed)) ||
    (step === 'vessels' && selected.length > 0);

  const pickBand = (id: AgeBandId) => {
    setAgeBand(id);
    setGoalMl(band(id).suggestedMl);
    setGoalConfirmed(false);
    if (!band(id).parentSetup) setParentConfirmed(false);
  };

  const next = async () => {
    if (!canNext) return;
    if (step !== 'vessels') {
      setStep(STEPS[index + 1] ?? 'vessels');
      return;
    }
    if (!ageBand) return;
    setSaving(true);
    await completeOnboarding({
      ageBand,
      goalMl,
      goalSource: goalMl === band(ageBand).suggestedMl ? 'suggested' : 'custom',
      units,
      cupMl,
      parentConfirmed,
      vessels: selected.map((v) => ({ name: v.name, ml: v.ml }))
    });
  };

  const titles: Record<Step, string> = {
    welcome: 'Hi, I’m Pip',
    age: 'How old is the person using WaterBuddy?',
    goal: 'A daily goal to start with',
    vessels: 'What do you usually drink from?'
  };

  return (
    <main className="screen onboarding">
      <p className="kicker">
        {step === 'welcome' ? 'Welcome' : `Step ${index} of ${STEPS.length - 1}`}
      </p>
      <h1 ref={heading} tabIndex={-1} className="title">
        {titles[step]}
      </h1>

      {step === 'welcome' && (
        <>
          <PipInBottle className="hero" fill={0.15} />
          <p className="lead">
            I keep the day&rsquo;s water in my bottle. Fill it up with me, one glass at a time, and tomorrow I&rsquo;ll have something to show
            you.
          </p>
          <ul className="promises">
            <li>Your drinks stay on this phone. No account needed.</li>
            <li>No streaks to lose, and never a nudge to drink more than you need.</li>
          </ul>
          <button type="button" className="link-btn" onClick={() => setPrivacyOpen(true)}>
            How your data is handled
          </button>
          <PrivacySheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
        </>
      )}

      {step === 'age' && (
        <fieldset className="options">
          <legend className="muted">We only ask for an age range, never a birthday.</legend>
          {AGE_BANDS.map((b) => (
            <label key={b.id} className="option">
              <input type="radio" name="age" value={b.id} checked={ageBand === b.id} onChange={() => pickBand(b.id)} />
              <span>
                <span className="option-title">{b.label}</span>
                {b.parentSetup ? (
                  <span className="option-note">Set up by a parent or guardian</span>
                ) : (
                  isMinor(b.id) && <span className="option-note">Everything stays on this phone</span>
                )}
              </span>
            </label>
          ))}
          {needsParent && (
            <label className="check-row note">
              <input type="checkbox" checked={parentConfirmed} onChange={(e) => setParentConfirmed(e.target.checked)} />
              <span>I&rsquo;m a parent or guardian setting this up for my child.</span>
            </label>
          )}
        </fieldset>
      )}

      {step === 'goal' && ageBand && (
        <GoalPicker
          bandId={ageBand}
          valueMl={goalMl}
          onChange={(ml) => {
            setGoalMl(ml);
            setGoalConfirmed(false);
          }}
          confirmed={goalConfirmed}
          onConfirmedChange={setGoalConfirmed}
          units={units}
          cupMl={cupMl}
        />
      )}

      {step === 'vessels' && (
        <>
          <fieldset className="options">
            <legend className="muted">Pick the ones you use. These become one-tap buttons. You can change sizes.</legend>
            {vessels.map((v, i) => (
              <div key={v.key} className="vessel-row">
                <label className="check-row grow">
                  <input
                    type="checkbox"
                    checked={v.selected}
                    onChange={(e) => setVessels((vs) => vs.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))}
                  />
                  <span>{v.name}</span>
                </label>
                <label className="ml-field">
                  <span className="sr-only">{v.name} size in millilitres</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={2000}
                    step={10}
                    value={v.ml}
                    onChange={(e) => setVessels((vs) => vs.map((x, j) => (j === i ? { ...x, ml: Number(e.target.value) || 0 } : x)))}
                  />
                  <span aria-hidden="true">ml</span>
                </label>
              </div>
            ))}
          </fieldset>
          <fieldset className="options">
            <legend className="label">Show amounts in</legend>
            <div className="segmented" role="radiogroup" aria-label="Units">
              {(['ml', 'cups', 'oz'] as Units[]).map((u) => (
                <label key={u} className="seg">
                  <input type="radio" name="units" value={u} checked={units === u} onChange={() => setUnits(u)} />
                  <span>{u === 'ml' ? 'Millilitres' : u === 'cups' ? 'Cups' : 'Fluid ounces'}</span>
                </label>
              ))}
            </div>
            {units === 'cups' && (
              <label className="ml-field inline">
                <span>One cup is</span>
                <input type="number" inputMode="numeric" min={100} max={500} step={10} value={cupMl} onChange={(e) => setCupMl(Number(e.target.value) || DEFAULT_CUP_ML)} />
                <span>ml</span>
              </label>
            )}
          </fieldset>
        </>
      )}

      <div className="bottom-actions">
        {index > 0 && (
          <button type="button" className="btn ghost" onClick={() => setStep(STEPS[index - 1] ?? 'welcome')}>
            Back
          </button>
        )}
        <button type="button" className="btn primary grow" disabled={!canNext || saving} onClick={next}>
          {step === 'welcome' ? 'Let’s set up' : step === 'vessels' ? 'Start filling' : 'Next'}
        </button>
      </div>
    </main>
  );
}
