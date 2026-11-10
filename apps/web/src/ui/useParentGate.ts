import { createContext, useContext } from 'react';

export type Guard = (action: () => void, why: string) => void;

/** Outside a provider (onboarding, tests) actions run straight away. */
export const GuardContext = createContext<Guard>((action) => action());

/** Runs an action, first asking a grown-up question in kid mode (see ParentGate.tsx). */
export function useParentGate(): Guard {
  return useContext(GuardContext);
}
