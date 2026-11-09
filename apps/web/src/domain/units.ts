// Everything is stored in millilitres; units only change how amounts are shown and typed.

export type Units = 'ml' | 'oz' | 'cups';

export const ML_PER_US_FL_OZ = 29.5735;
export const DEFAULT_CUP_ML = 250;

const num = (n: number, digits: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);

export function formatAmount(ml: number, units: Units, cupMl = DEFAULT_CUP_ML): string {
  if (units === 'oz') return `${num(ml / ML_PER_US_FL_OZ, 1)} fl oz`;
  if (units === 'cups') {
    const cups = ml / Math.max(1, cupMl);
    return `${num(cups, 1)} ${Math.abs(cups - 1) < 0.05 ? 'cup' : 'cups'}`;
  }
  if (ml >= 1000 && ml % 1000 === 0) return `${num(ml / 1000, 1)} L`;
  return `${num(ml, 0)} ml`;
}

/** The big number on Today: value and unit separately so they can be styled apart. */
export function formatBig(ml: number, units: Units, cupMl = DEFAULT_CUP_ML): { value: string; unit: string } {
  if (units === 'oz') return { value: num(ml / ML_PER_US_FL_OZ, 0), unit: 'fl oz' };
  if (units === 'cups') return { value: num(ml / Math.max(1, cupMl), 1), unit: 'cups' };
  return { value: num(ml, 0), unit: 'ml' };
}

export function toMl(value: number, units: Units, cupMl = DEFAULT_CUP_ML): number {
  if (!Number.isFinite(value)) return 0;
  if (units === 'oz') return Math.round(value * ML_PER_US_FL_OZ);
  if (units === 'cups') return Math.round(value * cupMl);
  return Math.round(value);
}

export function unitLabel(units: Units): string {
  return units === 'oz' ? 'fl oz' : units === 'cups' ? 'cups' : 'ml';
}

/** Spoken form for screen readers, e.g. "250 millilitres". */
export function spokenAmount(ml: number, units: Units, cupMl = DEFAULT_CUP_ML): string {
  return formatAmount(ml, units, cupMl).replace(/ ml$/, ' millilitres').replace(/ L$/, ' litres').replace('fl oz', 'fluid ounces');
}
