import { useId, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import type { DrinkLog } from '../data/db';
import { validLogMl } from '../data/repo';
import { formatAmount, toMl, unitLabel, type Units } from '../domain/units';
import { MAX_SINGLE_LOG_ML } from '../domain/guards';

type UnitProps = { units: Units; cupMl: number };

function AmountField({ value, onChange, units, cupMl, error }: UnitProps & { value: string; onChange: (v: string) => void; error: string | null }) {
  const id = useId();
  const errId = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        Amount ({unitLabel(units)})
      </label>
      <input
        id={id}
        className="big-input"
        type="number"
        inputMode="decimal"
        min={0}
        step={units === 'ml' ? 10 : 0.5}
        value={value}
        aria-invalid={!!error}
        aria-describedby={error ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={errId} className="error">
          {error}
        </p>
      )}
      {units !== 'ml' && value && !error && <p className="small muted">= {formatAmount(toMl(Number(value), units, cupMl), 'ml')}</p>}
    </div>
  );
}

function amountError(ml: number): string | null {
  if (!Number.isFinite(ml) || ml <= 0) return 'Enter an amount.';
  if (!validLogMl(ml)) return `Enter between 10 ml and ${formatAmount(MAX_SINGLE_LOG_ML, 'ml')} at a time.`;
  return null;
}

export function CustomAmountSheet({ open, onClose, onLog, units, cupMl }: UnitProps & { open: boolean; onClose: () => void; onLog: (ml: number) => void }) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const ml = toMl(Number(value), units, cupMl);
  const err = touched ? amountError(ml) : null;
  const quick = units === 'ml' ? [100, 150, 300, 750] : units === 'cups' ? [0.5, 1, 1.5, 2] : [4, 8, 12, 16];

  const close = () => {
    setValue('');
    setTouched(false);
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Log a custom amount">
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (amountError(ml)) return;
          onLog(ml);
          close();
        }}
      >
        <div className="chips">
          {quick.map((q) => (
            <button key={q} type="button" className="chip-btn" onClick={() => setValue(String(q))}>
              {q} {unitLabel(units)}
            </button>
          ))}
        </div>
        <AmountField value={value} onChange={setValue} units={units} cupMl={cupMl} error={err} />
        <button type="submit" className="btn primary">
          Log it
        </button>
      </form>
    </Sheet>
  );
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function EditLogSheet({
  log,
  onClose,
  onSave,
  onDelete,
  units,
  cupMl
}: UnitProps & { log: DrinkLog | null; onClose: () => void; onSave: (ml: number, at: Date) => void; onDelete: () => void }) {
  return (
    <Sheet open={!!log} onClose={onClose} title="Edit this drink">
      {log && <EditForm key={log.id} log={log} onSave={onSave} onDelete={onDelete} units={units} cupMl={cupMl} />}
    </Sheet>
  );
}

function EditForm({ log, onSave, onDelete, units, cupMl }: UnitProps & { log: DrinkLog; onSave: (ml: number, at: Date) => void; onDelete: () => void }) {
  const initial = units === 'ml' ? String(log.ml) : String(Math.round((log.ml / (units === 'cups' ? cupMl : 29.5735)) * 10) / 10);
  const [value, setValue] = useState(initial);
  const [time, setTime] = useState(toTimeInput(log.at));
  const timeId = useId();
  const ml = toMl(Number(value), units, cupMl);
  const err = amountError(ml);

  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (err) return;
        const [h, m] = time.split(':').map(Number);
        const at = new Date(log.at);
        at.setHours(h ?? at.getHours(), m ?? at.getMinutes(), 0, 0);
        onSave(ml, at);
      }}
    >
      <AmountField value={value} onChange={setValue} units={units} cupMl={cupMl} error={err} />
      <div className="field">
        <label htmlFor={timeId} className="label">
          Time
        </label>
        <input id={timeId} className="big-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn ghost danger" onClick={onDelete}>
          Delete
        </button>
        <button type="submit" className="btn primary grow" disabled={!!err}>
          Save
        </button>
      </div>
    </form>
  );
}
