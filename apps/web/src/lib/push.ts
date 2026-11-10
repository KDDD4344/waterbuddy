// Reminders via web push (Phase 6). The server stores only what's listed in
// apps/api/app/models.py; drink amounts never leave the phone.
import { apiBaseUrl } from './api';
import { isInstalled, isIos } from './pwa';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported' | 'no-server';

export function pushSupport(base = apiBaseUrl): PushSupport {
  if (!base) return 'no-server';
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  // iPhone and iPad only allow push for apps added to the Home Screen.
  if (isIos() && !isInstalled()) return 'needs-install';
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

/** A random id this device uses for its reminder row. It is the only key to it. */
export function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const api = (path: string, base = apiBaseUrl) => `${(base ?? '').replace(/\/$/, '')}${path}`;

export type EnableResult = { ok: true } | { ok: false; reason: string };

export async function enableReminders(opts: { id: string; time: string; bedtime: string; tz?: string }): Promise<EnableResult> {
  try {
    const keyRes = await fetch(api('/push/key'));
    if (!keyRes.ok) return { ok: false, reason: 'Reminders aren’t set up on the server yet.' };
    const { key } = (await keyRes.json()) as { key: string };
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'Notifications are blocked for WaterBuddy. You can allow them in your browser or phone settings.' };
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(key) }));
    const json = sub.toJSON();
    const res = await fetch(api(`/reminders/${opts.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
        tz: opts.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        time: opts.time,
        bedtime: opts.bedtime
      })
    });
    if (!res.ok) {
      const detail = ((await res.json().catch(() => ({}))) as { detail?: unknown }).detail;
      return { ok: false, reason: typeof detail === 'string' ? detail : 'The server couldn’t save your reminder. Try again later.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Couldn’t reach the WaterBuddy server. Check your connection and try again.' };
  }
}

export async function disableReminders(id: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // Unsubscribing locally is best effort; the server row is what matters.
  }
  try {
    await fetch(api(`/reminders/${id}`), { method: 'DELETE' });
  } catch {
    // Offline: the server drops the row itself the first time a push comes back "gone".
  }
}

export type ReminderState = 'active' | 'paused' | 'gone' | 'unknown';

/**
 * What the server knows about this device's reminder. "gone" means the row was deleted,
 * for example after 90 days without use (Phase 8 retention), so the app should show it off.
 */
export async function reminderState(id: string): Promise<ReminderState> {
  try {
    const res = await fetch(api(`/reminders/${id}`));
    if (res.status === 404) return 'gone';
    if (!res.ok) return 'unknown';
    return ((await res.json()) as { paused?: boolean }).paused === true ? 'paused' : 'active';
  } catch {
    return 'unknown';
  }
}

/** Tell the server only whether today's goal is met, so it stops reminding (safety rule 2). */
export async function syncToday(id: string, day: string, goalMet: boolean): Promise<boolean> {
  try {
    const res = await fetch(api(`/reminders/${id}/today`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, goal_met: goalMet })
    });
    return res.ok;
  } catch {
    return false;
  }
}
