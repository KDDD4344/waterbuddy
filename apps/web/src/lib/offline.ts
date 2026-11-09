// A tiny observable flag so the UI can show when the service worker has cached the app.
import { useSyncExternalStore } from 'react';

type Listener = () => void;

function createFlag(initial: boolean) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: boolean) {
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    }
  };
}

// Already controlled by a service worker means a previous visit cached the app.
export const offlineReady = createFlag(
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
);

export function useOfflineReady(): boolean {
  return useSyncExternalStore(offlineReady.subscribe, offlineReady.get, () => false);
}
