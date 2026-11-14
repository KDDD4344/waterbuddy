import { useId, useState } from 'react';
import { DEFAULT_CUP_ML, ML_PER_US_FL_OZ, type Units } from '../domain/units';

const fmt = (n: number, digits: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);

/**
 * Cups, millilitres and fluid ounces. "A cup" is the person's own cup size from settings
 * (cups vary: a steel tumbler, a mug, a US cup of 240 ml), and the US cup is shown too.
 */
export function Converter({ cupMl = DEFAULT_CUP_ML }: { cupMl?: number }) {
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState<Units>('cups');
  const id = useId();
  const n = Number(value.replace(',', '.'));
  const ok = Number.isFinite(n) && n >= 0 && n <= 100000;
  const ml = !ok ? 0 : from === 'ml' ? n : from === 'oz' ? n * ML_PER_US_FL_OZ : n * cupMl;
  return (
    <div className="converter">
      <p className="setting-label" id={`${id}-t`}>
        Converter
      </p>
      <div className="converter-row" role="group" aria-labelledby={`${id}-t`}>
        <label className="sr-only" htmlFor={`${id}-v`}>
          Amount
        </label>
        <input
          id={`${id}-v`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <label className="sr-only" htmlFor={`${id}-u`}>
          Unit
        </label>
        <select id={`${id}-u`} value={from} onChange={(e) => setFrom(e.target.value as Units)}>
          <option value="cups">your cups ({cupMl} ml)</option>
          <option value="ml">ml</option>
          <option value="oz">US fl oz</option>
        </select>
      </div>
      <p className="converter-out" aria-live="polite">
        {ok ? (
          <>
            = <b>{fmt(ml, 0)} ml</b> · {fmt(ml / cupMl, 2)} of your cups · {fmt(ml / 240, 2)} US cups ·{' '}
            {fmt(ml / ML_PER_US_FL_OZ, 1)} fl oz
          </>
        ) : (
          'Type an amount.'
        )}
      </p>
    </div>
  );
}
