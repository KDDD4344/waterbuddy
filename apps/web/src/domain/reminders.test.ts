import { afterEach, describe, expect, it, vi } from 'vitest';
import { reminderText, reminderTimeProblem, staySilent, suggestedTime } from './reminders';
import { enableReminders, newDeviceId, pushSupport, syncToday } from '../lib/push';

describe('reminder rules on the phone', () => {
  it('maps field task 9 answers to a time', () => {
    expect(suggestedTime('Around lunch')).toBe('12:30');
    expect(suggestedTime(undefined)).toBe('09:00');
  });

  it('keeps reminders between 6 am and last call, like the server', () => {
    expect(reminderTimeProblem('09:00', '22:30')).toBeNull();
    expect(reminderTimeProblem('05:30', '22:30')).toMatch(/6 am/);
    expect(reminderTimeProblem('20:00', '22:30')).toMatch(/last call/);
    expect(reminderTimeProblem('22:00', '01:00')).toBeNull();
  });

  it('never shows a reminder after the goal or after last call', () => {
    expect(staySilent({ goalMet: true, afterLastCall: false })).toBe(true);
    expect(staySilent({ goalMet: false, afterLastCall: true })).toBe(true);
    expect(staySilent({ goalMet: false, afterLastCall: false })).toBe(false);
  });

  it('words reminders gently, with no guilt, streaks or diagnosis', () => {
    const banned = /dehydrat|forgot|missed|streak|should|behind|only \d/i;
    for (let d = 1; d <= 28; d++) {
      const { body } = reminderText('have my morning chai', `2026-11-${String(d).padStart(2, '0')}`);
      expect(body).not.toMatch(banned);
    }
    const bodies = new Set(Array.from({ length: 8 }, (_, d) => reminderText('have my morning chai', `2026-11-1${d}`).body));
    expect([...bodies].some((b) => b.startsWith('Your cue:'))).toBe(true);
  });
});

describe('push client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says when there is no server to send reminders', () => {
    expect(pushSupport('')).toBe('no-server');
  });

  it('makes a random 24-character device id', () => {
    const a = newDeviceId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newDeviceId()).not.toBe(a);
  });

  it('sends the server only the subscription, time zone, reminder time and bedtime', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith('/push/key')) return new Response(JSON.stringify({ key: 'BElbcmxsb3dvcmxkaGVsbG93b3JsZGhlbGxvd29ybGQ' }));
        return new Response(JSON.stringify({ time: '09:00', tz: 'Asia/Kolkata', bedtime: '22:30', paused: false }));
      })
    );
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    const sub = { toJSON: () => ({ endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } }) };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => null, subscribe: async () => sub } }) }
    });

    const res = await enableReminders({ id: 'device-id-abcdefghijklmn', time: '09:00', bedtime: '22:30', tz: 'Asia/Kolkata' });
    expect(res).toEqual({ ok: true });
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    const body = JSON.parse(String(put.init!.body));
    expect(Object.keys(body).sort()).toEqual(['bedtime', 'subscription', 'time', 'tz']);
    expect(body.subscription).toEqual({ endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } });
  });

  it('reports blocked notifications plainly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ key: 'AAAA' }))));
    vi.stubGlobal('Notification', { requestPermission: async () => 'denied' });
    const res = await enableReminders({ id: 'device-id-abcdefghijklmn', time: '09:00', bedtime: '22:30' });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.reason).toMatch(/blocked/);
  });

  it('tells the server only yes or no for today', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await syncToday('device-id-abcdefghijklmn', '2026-11-10', true)).toBe(true);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ day: '2026-11-10', goal_met: true });
  });
});
