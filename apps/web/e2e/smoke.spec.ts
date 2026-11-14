import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s set up' }).click();
  await page.getByRole('radio', { name: /18 to 64/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start filling' }).click();
  await expect(page.getByRole('button', { name: /Log 250 ml/ })).toBeVisible();
}

const stat = (page: Page) => page.getByLabel("Today's progress");
const API = 'http://localhost:8765';

test('first run starts with Ripple saying hello', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, I’m Ripple' })).toBeVisible();
});

test('the app is installable: manifest with icons', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest.name).toBe('WaterBuddy');
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
});

test('a logged drink survives closing and reopening the app', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /Log 250 ml/ }).click();
  await expect(stat(page)).toContainText('250 millilitres of 2 litres');
  await page.reload();
  await expect(stat(page)).toContainText('250 millilitres of 2 litres');
});

test('logging takes under 2 seconds from tap to updated total', async ({ page }) => {
  await onboard(page);
  const start = Date.now();
  await page.getByRole('button', { name: /Log 500 ml/ }).click();
  await expect(stat(page)).toContainText('500 millilitres of 2 litres');
  expect(Date.now() - start).toBeLessThan(2000);
});

test('Ripple’s spring loads after the numbers, and a pour plays without blocking logging', async ({ page }, info) => {
  test.setTimeout(120_000);
  // CI's Chromium draws WebGL on the CPU; ask for the live spring anyway (the app's "Show it anyway").
  await page.addInitScript(() => localStorage.setItem('wb-3d-anyway', '1'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  test.skip(!hasWebGL, 'This browser build has no WebGL; the flat drawing is used instead.');

  await onboard(page);
  // The numbers are usable before the 3D scene exists.
  await expect(stat(page)).toContainText('0 millilitres of 2 litres');
  await expect(page.locator('.pond[data-live]')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('today-3d-idle.png') });

  await page.getByRole('button', { name: /Log 500 ml/ }).click();
  await expect(stat(page)).toContainText('500 millilitres of 2 litres');
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath('today-3d-pouring.png') });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('today-3d-after.png') });
  expect(errors).toEqual([]);
});

test('works in airplane mode after the first visit', async ({ page, context }) => {
  await onboard(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Make sure the service worker controls the page before going offline.
  await page.reload();
  await expect(page.getByRole('button', { name: /Log 250 ml/ })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Log 250 ml/ })).toBeVisible();
  await page.getByRole('button', { name: /Log 250 ml/ }).click();
  await expect(stat(page)).toContainText('250 millilitres of 2 litres');
  await context.setOffline(false);
});

test('a field task takes under 30 seconds from the Today chip and lands in the Journal', async ({ page }, info) => {
  await onboard(page);
  const start = Date.now();
  await page.getByRole('button', { name: /Field task 1 of 14/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Pick a cue for your first glass').first()).toBeVisible();
  await page.waitForTimeout(600); // let the sheet finish unfolding for the screenshot
  await page.screenshot({ path: info.outputPath('task-sheet.png') });
  await sheet.getByRole('radio', { name: 'Have my morning chai' }).check();
  await sheet.getByRole('button', { name: 'Set this cue' }).click();
  await expect(sheet.getByRole('img', { name: 'Pressed leaf sticker' })).toBeVisible();
  expect(Date.now() - start).toBeLessThan(30_000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('task-sticker.png') });
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/Your cue: When I have my morning chai/)).toBeVisible();

  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByText('1 of 14 pressed in')).toBeVisible();
  await page.getByRole('textbox', { name: 'Today' }).fill('Chai, then a full glass.');
  await page.getByRole('button', { name: 'Save line' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('journal.png'), fullPage: true });

  await page.reload();
  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByText('1 of 14 pressed in')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Today' })).toHaveValue('Chai, then a full glass.');
});

test('"Not today" costs nothing', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /Field task 1 of 14/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Not today' }).click();
  await expect(page.getByText('Field task saved for tomorrow. Nothing lost.')).toBeVisible();
  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByText('0 of 14 pressed in')).toBeVisible();
});

test('night voyage: the goal is reached, night falls, and a postcard washes up next morning', async ({
  page
}, info) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
  await onboard(page);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /Log 500 ml/ }).click();
    // Taps at a person's pace: a repeat within 0.6 s counts as an accidental double tap.
    await page.waitForTimeout(700);
  }
  await expect(stat(page)).toContainText('Goal reached');
  await page.waitForTimeout(4500); // pour, then Ripple's celebration
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('voyage-corked.png') });

  await page.clock.setFixedTime(new Date('2026-11-10T21:00:00'));
  await page.reload();
  await expect(page.locator('.stage')).toHaveAttribute('data-phase', 'night');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('voyage-night.png') });

  await page.clock.setFixedTime(new Date('2026-11-11T07:30:00'));
  await page.reload();
  await expect(stat(page)).toContainText('0 millilitres of 2 litres');
  // The bottle bobs on the water forever, so don't wait for it to hold still.
  await page.getByRole('button', { name: 'A message washed up. Open it' }).click({ force: true });
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Postcard 1 of 6' })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('postcard-front.png') });
  await sheet.getByRole('button', { name: 'Turn it over' }).click();
  await expect(sheet.getByText(/The islands here float!/)).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('postcard-back.png') });
  await sheet.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByText(/1 of 6 · Ripple sends a card/)).toBeVisible();
  await page.getByText('Postcards · Route I').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('album.png') });
});

test('after last call there is no countdown, only "More tomorrow"', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T21:15:00'));
  await onboard(page);
  await expect(stat(page)).toContainText('More tomorrow');
  await expect(stat(page)).not.toContainText('to go');
});

test('Atlas: Ripple’s spring responds to touch, the quest fills in, and exploring never logs water', async ({ page }, info) => {
  test.setTimeout(240_000);
  const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  test.skip(!hasWebGL, 'No WebGL in this browser build.');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // ?dev exposes the scene so the test can find where things are on screen.
  await page.goto('/?dev');
  await page.getByRole('button', { name: 'Let’s set up' }).click();
  await page.getByRole('radio', { name: /18 to 64/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start filling' }).click();
  await expect(stat(page)).toBeVisible();
  // CI's Chromium draws WebGL on the CPU: ask for the live spring (the app's "Show it anyway"),
  // only now, so Today keeps its still picture and the test stays quick.
  await page.evaluate(() => localStorage.setItem('wb-3d-anyway', '1'));
  await page.getByRole('button', { name: 'Atlas' }).click();
  await expect(page.getByRole('heading', { name: 'The spring' })).toBeVisible();
  await expect(page.locator('.pond[data-live]')).toBeVisible({ timeout: 150_000 });
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.waitForTimeout(1500);
  // For each thing, the first point along it that is on the canvas and picks that thing. Worked
  // out just before each tap: the camera drifts a little while nobody touches it.
  const spotsNow = () => page.evaluate(() => {
    type V3 = { clone(): V3; add(v: V3): V3; addScaledVector(v: V3, k: number): V3; project(c: unknown): V3; x: number; y: number };
    const s = (window as unknown as { __pond: unknown }).__pond as {
      camera: { position: { constructor: new (x: number, y: number, z: number) => V3 } };
      seatTop: V3;
      level: number;
      world: { spout: { mouth: V3; dir: V3 } };
      life: { lilies: { group: { position: V3 } }[] };
      canvas: HTMLCanvasElement;
      pick(n: V3): { what: string } | null;
    };
    const V = s.camera.position.constructor;
    const r = s.canvas.getBoundingClientRect();
    const first = (what: string, pts: V3[]) => {
      for (const p of pts) {
        const q = p.clone().project(s.camera);
        const x = r.left + ((q.x + 1) / 2) * r.width;
        const y = r.top + ((1 - q.y) / 2) * r.height;
        const hit = what === 'water' ? null : s.pick(q)?.what;
        if (document.elementFromPoint(x, y) === s.canvas && (what === 'water' || hit === what)) return { x, y };
      }
      return null;
    };
    const m = s.world.spout.mouth;
    const d = s.world.spout.dir;
    return {
      ripple: first('ripple', [0.75, 0.5, 1].map((h) => s.seatTop.clone().add(new V(0, h, 0)))),
      pad: first('pad', s.life.lilies.map((l) => l.group.position)),
      spout: first('spout', [0, -0.1, -0.25, -0.5, -0.8].map((k) => m.clone().addScaledVector(d, k))),
      water: first('water', [new V(0.9, s.level, 1.0), new V(-0.6, s.level, 0.9), new V(0.3, s.level, 1.4)])
    };
  });
  for (const k of ['ripple', 'pad', 'spout', 'water'] as const) {
    const p = (await spotsNow())[k];
    expect(p, `${k} is on screen`).not.toBeNull();
    await page.mouse.click(p!.x, p!.y);
    await page.waitForTimeout(800);
  }
  await expect(page.locator('.quest')).toContainText('4 of 4', { timeout: 15_000 });
  await expect(page.getByText(/Today’s quest is complete/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('atlas-spring.png') });
  // Exploring logged nothing.
  await expect(page.locator('.spring-total')).toContainText('0 ml');
  // Pouring here logs exactly one glass, like Today.
  await page.getByRole('button', { name: 'Pour 250 ml' }).click();
  await expect(page.locator('.spring-total')).toContainText('250 ml');
  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByText(/Today’s quest: 4 of 4/)).toBeVisible();
  await expect(page.getByText(/Quests completed this week: 1/)).toBeVisible();
  expect(errors).toEqual([]);
});


async function reminderId(page: Page): Promise<string | undefined> {
  return page.evaluate(async () => {
    const req = indexedDB.open('waterbuddy');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    return new Promise<string | undefined>((r) => {
      const g = db.transaction('profile').objectStore('profile').get('me');
      g.onsuccess = () => r((g.result as { reminders?: { id: string } }).reminders?.id);
    });
  });
}

test('reminders: turn on, the server learns only time, zone, bedtime and goal-met, and goes quiet at the goal', async ({
  page,
  context,
  request,
  browserName
}) => {
  test.skip(browserName !== 'chromium', 'iPhone needs the Home Screen app for push; covered by the next test.');
  test.setTimeout(60_000);
  await context.grantPermissions(['notifications'], { origin: 'http://localhost:4173' });
  // Headless browsers have no push service, so the subscription itself is faked.
  await page.addInitScript(() => {
    const fake = {
      endpoint: 'https://push.example.test/e2e',
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            auth: 'tBHItJI5svbpez7KI4CCXg'
          }
        };
      },
      unsubscribe: async () => true
    };
    let on = false;
    PushManager.prototype.subscribe = async function () {
      on = true;
      return fake as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      return (on ? fake : null) as unknown as PushSubscription | null;
    };
  });
  const sent: unknown[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(API) && r.method() !== 'GET') sent.push({ url: r.url(), body: r.postDataJSON?.() ?? null });
  });

  await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
  await onboard(page);
  await page.getByRole('button', { name: 'You', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible();
  await page.getByLabel('Remind me at').fill('20:00');
  await expect(page.getByRole('alert')).toContainText('too close to last call');
  await page.getByLabel('Remind me at').fill('11:00');
  await page.getByRole('button', { name: 'Turn on daily reminder' }).click();
  await expect(page.getByRole('status')).toContainText('Daily reminder set for 11:00 am');

  const id = (await reminderId(page))!;
  expect(id).toMatch(/^[A-Za-z0-9_-]{24}$/);
  const saved = await (await request.get(`${API}/reminders/${id}`)).json();
  expect(saved).toMatchObject({ time: '11:00', bedtime: '22:30', paused: false, goal_met_day: null });

  // Fill the bottle: the server hears only "goal met today".
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /Log 500 ml/ }).click();
    // Taps at a person's pace: a repeat within 0.6 s counts as an accidental double tap.
    await page.waitForTimeout(700);
  }
  await expect(stat(page)).toContainText('Goal reached');
  await expect
    .poll(async () => (await (await request.get(`${API}/reminders/${id}`)).json()).goal_met_day)
    .toBe('2026-11-10');

  // Nothing sent to the server mentions an amount.
  expect(JSON.stringify(sent)).not.toMatch(/ml|2000|500|total/i);

  // Turning reminders off deletes the server's row.
  await page.getByRole('button', { name: 'You', exact: true }).click();
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByRole('status')).toContainText('Reminders off');
  expect((await request.get(`${API}/reminders/${id}`)).status()).toBe(404);
});

test('a reminder push is shown only before the goal, in gentle words', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service worker push events are checked in Chromium.');
  await page.clock.setFixedTime(new Date('2026-11-10T11:00:00'));
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Headless Chromium can't display notifications, so record what the worker asks to show.
  const pushAt = (iso: string) =>
    sw.evaluate(async (time) => {
      const g = self as unknown as ServiceWorkerGlobalScope & { __shown?: string[] };
      g.__shown = [];
      const RealDate = Date;
      const fixed = new RealDate(time).getTime();
      // @ts-expect-error test-only clock for the worker
      g.Date = class extends RealDate {
        constructor(...args: []) {
          super(...((args.length ? args : [fixed]) as []));
        }
        static now() {
          return fixed;
        }
      };
      g.registration.showNotification = async (_title: string, opts?: NotificationOptions) => {
        g.__shown!.push(opts?.body ?? '');
      };
      const PushEventCtor = (g as unknown as { PushEvent: new (t: string, i: object) => Event }).PushEvent;
      g.dispatchEvent(
        new PushEventCtor('push', {
          data: JSON.stringify({ t: 'reminder', id: 'device-e2e-abcdefghijkl', day: '2026-11-10' })
        })
      );
      await new Promise((r) => setTimeout(r, 800));
      g.Date = RealDate;
      return g.__shown;
    }, iso);

  const before = await pushAt('2026-11-10T11:00:00');
  expect(before).toHaveLength(1);
  expect(before[0]).not.toMatch(/dehydrat|missed|streak|forgot|should/i);

  // After last call (20:30 with the default bedtime) nothing is shown.
  expect(await pushAt('2026-11-10T21:00:00')).toEqual([]);

  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /Log 500 ml/ }).click();
    // Taps at a person's pace: a repeat within 0.6 s counts as an accidental double tap.
    await page.waitForTimeout(700);
  }
  await expect(stat(page)).toContainText('Goal reached');
  expect(await pushAt('2026-11-10T12:00:00')).toEqual([]);
});

test('on iPhone, reminders explain the Home Screen step first', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone only.');
  await onboard(page);
  await page.getByRole('button', { name: 'You', exact: true }).click();
  await expect(page.getByText('reminders work once WaterBuddy is on your Home Screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Install WaterBuddy' })).toBeVisible();
  await expect(page.getByText('Add to Home Screen', { exact: true })).toBeVisible();
});

test('offline, Ripple’s spring still loads from the cache', async ({ page, context }) => {
  test.setTimeout(150_000);
  // CI's Chromium draws WebGL on the CPU; ask for the live spring anyway (the app's "Show it anyway").
  await page.addInitScript(() => localStorage.setItem('wb-3d-anyway', '1'));
  const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  test.skip(!hasWebGL, 'No WebGL in this browser build.');
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Atlas' }).click();
  await expect(page.locator('.pond[data-live]')).toBeVisible({ timeout: 90_000 });
  await context.setOffline(false);
});
