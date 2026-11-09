import type { PourEvent } from './controller';

export type TidepoolEvent = { type: 'pour'; event: PourEvent } | { type: 'undo'; toFill: number } | { type: 'celebrate' };
type Listener = (e: TidepoolEvent) => void;

/**
 * Today's logging code lives outside the 3D bundle. It talks to the scene through this
 * tiny bus, so logging never waits for (or imports) three.js.
 */
function createBus() {
  const listeners = new Set<Listener>();
  return {
    emit(e: TidepoolEvent) {
      listeners.forEach((l) => l(e));
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    }
  };
}

export const tidepoolBus = createBus();
export type TidepoolBus = ReturnType<typeof createBus>;
