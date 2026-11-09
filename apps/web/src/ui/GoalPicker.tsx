import { useId } from 'react';
import { band, clampGoal, goalWarning, MEDICAL_NOTE, type AgeBandId } from '../domain/goals';
import { formatAmount, type Units } from '../domain/units';

type Props = {
  bandId: AgeBandId;
  valueMl: number;
  onChange: (ml: number) => void;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
  units: Units;
  cupMl: number;
};

/** Shared by onboarding and settings: suggestion with its reason and source, a stepper, and the goal guard. */
export function GoalPicker({ bandId, valueMl, onChange, confirmed, onConfirmedChange, units, cupMl }: Props) {
  const b = band(bandId);
  const inputId = useId();
  const warning = goalWarning(bandId, valueMl);

  return (
    <div className="goal-picker">
      <div className="goal-value">
        <button type="button" className="step-btn" onClick={() => onChange(clampGoal(valueMl - 50))} aria-label="Lower the goal by 50 millilitres">
          &minus;
        </button>
        <label htmlFor={inputId} className="sr-only">
          Daily goal in millilitres
        </label>
        <input
          id={inputId}
          className="goal-input"
          type="number"
          inputMode="numeric"
          min={500}
          max={5000}
          step={50}
          value={valueMl}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          onBlur={() => onChange(clampGoal(valueMl))}
        />
        <span className="goal-unit" aria-hidden="true">
          ml
        </span>
        <button type="button" className="step-btn" onClick={() => onChange(clampGoal(valueMl + 50))} aria-label="Raise the goal by 50 millilitres">
          +
        </button>
      </div>
      {units !== 'ml' && <p className="muted center">That&rsquo;s about {formatAmount(valueMl, units, cupMl)} a day.</p>}

      <div className="why">
        <p className="label">Suggested for ages {b.label}: {formatAmount(b.suggestedMl, 'ml')}</p>
        <p>{b.why}</p>
        <p className="small">
          Source:{' '}
          {b.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && '; '}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            </span>
          ))}
        </p>
        {valueMl !== b.suggestedMl && (
          <button type="button" className="link-btn" onClick={() => onChange(b.suggestedMl)}>
            Use the suggestion
          </button>
        )}
      </div>

      {warning && (
        <div className="note warn" role="alert">
          <p>{warning}</p>
          <label className="check-row">
            <input type="checkbox" checked={confirmed} onChange={(e) => onConfirmedChange(e.target.checked)} />
            <span>Use this goal anyway</span>
          </label>
        </div>
      )}
      <p className="small muted">{MEDICAL_NOTE}</p>
    </div>
  );
}
