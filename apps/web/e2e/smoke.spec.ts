import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Let’s set up' }).click();
  await page.getByRole('radio', { name: /18 to 64/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start filling' }).click();
  await expect(page.getByRole('button', { name: /Log 250 millilitres/ })).toBeVisible();
}

const stat = (page: Page) => page.getByLabel("Today's progress");

test('first run starts with Pip saying hello', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, I’m Pip' })).toBeVisible();
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
  await page.getByRole('button', { name: /Log 250 millilitres/ }).click();
  await expect(stat(page)).toContainText('250 millilitres of 2 litres');
  await page.reload();
  await expect(stat(page)).toContainText('250 millilitres of 2 litres');
});

test('logging takes under 2 seconds from tap to updated total', async ({ page }) => {
  await onboard(page);
  const start = Date.now();
  await page.getByRole('button', { name: /Log 500 millilitres/ }).click();
  await expect(stat(page)).toContainText('500 millilitres of 2 litres');
  expect(Date.now() - start).toBeLessThan(2000);
});

test('Pip’s 3D tidepool loads after the numbers, and a pour plays without blocking logging', async ({ page }, info) => {
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
  await expect(page.locator('.stage-3d.ready')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('today-3d-idle.png') });

  await page.getByRole('button', { name: /Log 500 millilitres/ }).click();
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
  await expect(page.getByRole('button', { name: /Log 250 millilitres/ })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Log 250 millilitres/ })).toBeVisible();
  await page.getByRole('button', { name: /Log 250 millilitres/ }).click();
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

test('night voyage: the goal corks the bottle, night falls, and a postcard washes up next morning', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
  await onboard(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Log 500 millilitres/ }).click();
  await expect(stat(page)).toContainText('Bottle full and corked');
  await page.waitForTimeout(4500); // pour, cheer, then the cork
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
  await expect(page.getByText(/1 of 6 · a card washes up/)).toBeVisible();
  await page.getByText('Postcards · Route I').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('album.png') });
});

test('after last call there is no countdown, only "We’ll sail tomorrow"', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T21:15:00'));
  await onboard(page);
  await expect(stat(page)).toContainText('We’ll sail tomorrow');
  await expect(stat(page)).not.toContainText('glasses to go');
});

test('the Waterverse: Pip sails to new islands, the fog lifts, and every place is reachable from the list', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));

  // Two goal days, then the next morning.
  await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
  await onboard(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Log 500 millilitres/ }).click();
  await expect(stat(page)).toContainText('Bottle full and corked');
  await page.clock.setFixedTime(new Date('2026-11-11T10:00:00'));
  await page.reload();
  await expect(page.getByRole('button', { name: /message washed up/ })).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Log 500 millilitres/ }).click();
  await expect(stat(page)).toContainText('Bottle full and corked');
  await page.clock.setFixedTime(new Date('2026-11-12T08:00:00'));
  await page.reload();
  await expect(page.getByRole('button', { name: /2 messages washed up/ })).toBeVisible();

  await page.getByRole('button', { name: 'Atlas' }).click();
  await expect(page.getByRole('heading', { name: 'The Waterverse' })).toBeVisible();
  await expect(page.getByText('2 of 6 out of the fog')).toBeVisible();

  if (hasWebGL) {
    await expect(page.locator('.atlas-3d.ready')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: info.outputPath('waterverse-sailing.png') });
    // two legs and two fog lifts
    await page.waitForTimeout(16_000);
    await page.screenshot({ path: info.outputPath('waterverse-after.png') });

    // drag pans the map
    const label = page.locator('.atlas-label').first();
    const before = await label.evaluate((el) => (el as HTMLElement).style.transform);
    const box = (await page.locator('.waterverse-canvas canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height * 0.6 + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await label.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(before);
  }

  // The list reaches every place, with or without 3D.
  const places = page.getByRole('list').filter({ has: page.locator('.place') }).getByRole('button');
  await expect(places).toHaveCount(6);
  await places.nth(1).click();
  await expect(page.locator('.island-card')).toContainText('Umngot River');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: info.outputPath('waterverse-island.png') });
  await page.getByRole('button', { name: 'Read the postcard' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Postcard 2 of 6' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await places.nth(4).click();
  await expect(page.locator('.island-card')).toContainText('Still in the fog');

  // Coming back later does not replay the voyage.
  await page.reload();
  await page.getByRole('button', { name: 'Atlas' }).click();
  expect(await page.evaluate(async () => {
    const req = indexedDB.open('waterbuddy');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const p = await new Promise<{ atlasSeen?: number }>((r) => {
      const g = db.transaction('profile').objectStore('profile').get('me');
      g.onsuccess = () => r(g.result);
    });
    return p.atlasSeen ?? 0;
  })).toBe(hasWebGL ? 2 : 2);
  expect(errors).toEqual([]);
});

const API = 'http://localhost:8765';

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

test('reminders: turn on, the server learns only time, zone, bedtime and goal-met, and goes quiet at the goal', async ({ page, context, request, browserName }) => {
  test.skip(browserName !== 'chromium', 'iPhone needs the Home Screen app for push; covered by the next test.');
  test.setTimeout(60_000);
  await context.grantPermissions(['notifications'], { origin: 'http://localhost:4173' });
  // Headless browsers have no push service, so the subscription itself is faked.
  await page.addInitScript(() => {
    const fake = {
      endpoint: 'https://push.example.test/e2e',
      toJSON() {
        return { endpoint: this.endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
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
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Log 500 millilitres/ }).click();
  await expect(stat(page)).toContainText('Bottle full and corked');
  await expect.poll(async () => (await (await request.get(`${API}/reminders/${id}`)).json()).goal_met_day).toBe('2026-11-10');

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
      g.dispatchEvent(new PushEventCtor('push', { data: JSON.stringify({ t: 'reminder', id: 'device-e2e-abcdefghijkl', day: '2026-11-10' }) }));
      await new Promise((r) => setTimeout(r, 800));
      g.Date = RealDate;
      return g.__shown;
    }, iso);

  const before = await pushAt('2026-11-10T11:00:00');
  expect(before).toHaveLength(1);
  expect(before[0]).not.toMatch(/dehydrat|missed|streak|forgot|should/i);

  // After last call (20:30 with the default bedtime) nothing is shown.
  expect(await pushAt('2026-11-10T21:00:00')).toEqual([]);

  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /Log 500 millilitres/ }).click();
  await expect(stat(page)).toContainText('Bottle full and corked');
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

test('offline, the 3D Waterverse still loads from the cache', async ({ page, context }) => {
  const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  test.skip(!hasWebGL, 'No WebGL in this browser build.');
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Atlas' }).click();
  await expect(page.locator('.atlas-3d.ready')).toBeVisible({ timeout: 20_000 });
  await context.setOffline(false);
});
