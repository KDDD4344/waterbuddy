import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}

const getSystem = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false);

/** The system setting, unless the person chose otherwise in WaterBuddy. */
export function useReducedMotion(override?: boolean): boolean {
  const system = useSyncExternalStore(subscribe, getSystem, () => false);
  return override ?? system;
}
