/// <reference lib="webworker" />
/**
 * WaterBuddy service worker: precaches the whole app (including the 3D scenes and fonts)
 * so it works offline, and shows reminders that arrive by web push (Phase 6).
 *
 * A push carries no health data. The words come from what's stored on this phone, and a
 * reminder that turns up after the goal is met or after last call is never shown.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';
import { WaterBuddyDB } from './data/db';
import { dayKey } from './domain/dates';
import { isAfterLastCall } from './domain/voyage';
import { reminderText, staySilent } from './domain/reminders';

declare let self: ServiceWorkerGlobalScope;

void self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// The Hero Lab (/lab/) is its own page; don't answer its navigations with the app shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/lab(\/|$)/] }));

const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function post(path: string, body: unknown): Promise<void> {
  if (!API) return;
  try {
    await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    // Offline: nothing to do; the next reminder will try again.
  }
}

async function localState(now: Date) {
  const db = new WaterBuddyDB();
  try {
    const today = dayKey(now);
    const [profile, logs, goals, cueTask] = await Promise.all([
      db.profile.get('me'),
      db.logs.where('day').equals(today).toArray(),
      db.goals.toArray(),
      db.tasks.get('first-cue')
    ]);
    const total = logs.filter((l) => !l.deletedAt).reduce((s, l) => s + l.ml, 0);
    const change = goals.filter((g) => g.day <= today).sort((a, b) => (a.day + a.at).localeCompare(b.day + b.at)).pop();
    const goal = change?.ml ?? profile?.goalMl ?? Infinity;
    const cue = cueTask?.status === 'done' && cueTask.answer?.kind === 'text' ? cueTask.answer.value : null;
    return { today, goalMet: total >= goal, afterLastCall: isAfterLastCall(now, profile?.bedtime), cue };
  } finally {
    db.close();
  }
}

type ReminderPush = { t: 'reminder'; id: string; day: string };

self.addEventListener('push', (event) => {
  let data: ReminderPush | null = null;
  try {
    data = event.data?.json() as ReminderPush;
  } catch {
    return;
  }
  if (data?.t !== 'reminder') return;
  const push = data;
  event.waitUntil(
    (async () => {
      const s = await localState(new Date());
      if (staySilent(s)) {
        // The server didn't know yet; tell it, so nothing else comes today.
        if (s.goalMet) await post(`/reminders/${push.id}/today`, { day: s.today, goal_met: true });
        return;
      }
      const { title, body } = reminderText(s.cue, push.day);
      await self.registration.showNotification(title, {
        body,
        tag: 'waterbuddy-reminder',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { id: push.id }
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = (event.notification.data as { id?: string } | undefined)?.id;
  event.waitUntil(
    (async () => {
      if (id) await post(`/reminders/${id}/feedback`, { action: 'opened' });
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) await open.focus();
      else await self.clients.openWindow('/');
    })()
  );
});

self.addEventListener('notificationclose', (event) => {
  const id = (event.notification.data as { id?: string } | undefined)?.id;
  if (id) event.waitUntil(post(`/reminders/${id}/feedback`, { action: 'dismissed' }));
});
