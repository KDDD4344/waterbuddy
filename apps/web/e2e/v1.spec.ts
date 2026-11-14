import { test, expect, type Page } from '@playwright/test';

// WaterBuddy V1: the flows added or changed when the Hero Lab became the app.
// These run in emulated browsers (Pixel 7 in Chromium, iPhone 14 in WebKit), not on devices.

const stat = (page: Page) => page.getByLabel("Today's progress");

async function onboard(page: Page, band = /18 to 64/, path = '/') {
  await page.goto(path);
  await page.getByRole('button', { name: 'Let’s set up' }).click();
  await page.getByRole('radio', { name: band }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start filling' }).click();
  await expect(stat(page)).toBeVisible();
}

test('onboarding: an age band suggests a goal, labelled as a starting point, and a custom goal sticks', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, I’m Ripple' })).toBeVisible();
  await page.getByRole('button', { name: 'Let’s set up' }).click();
  await page.getByRole('radio', { name: /65 or older/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('A starting point, not a prescription.')).toBeVisible();
  await expect(page.getByText(/Suggested for ages 65 or older: 1,800 ml/)).toBeVisible();
  // Own goal: two steps up from the suggestion.
  await page.getByRole('button', { name: 'Raise the goal by 50 millilitres' }).click();
  await page.getByRole('button', { name: 'Raise the goal by 50 millilitres' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start filling' }).click();
  await expect(stat(page)).toContainText('0 millilitres of 1,900 millilitres');
  await page.reload();
  await expect(stat(page)).toContainText('of 1,900 millilitres');
});

test('quick-adds log exactly, a custom amount works, a double tap logs once, and Undo removes exactly that drink', async ({
  page
}) => {
  await onboard(page);
  for (const [label, total] of [
    [/Log 150 ml/, '150 millilitres'],
    [/Log 250 ml/, '400 millilitres'],
    [/Log 500 ml/, '900 millilitres']
  ] as const) {
    await page.getByRole('button', { name: label }).click();
    await expect(stat(page)).toContainText(`${total} of 2 litres`);
  }
  await expect(page.getByText(/of 2 L · 45% · 1,100 ml to go/)).toBeVisible();
  // Custom amount
  await page.getByRole('button', { name: /Other/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('spinbutton').fill('330');
  await sheet.getByRole('button', { name: /^Log/ }).click();
  await expect(stat(page)).toContainText('1,230 millilitres of 2 litres');
  // An accidental double tap logs one drink.
  await page.getByRole('button', { name: /Log 150 ml/ }).dblclick();
  await expect(stat(page)).toContainText('1,380 millilitres of 2 litres');
  await page.waitForTimeout(700);
  await expect(stat(page)).toContainText('1,380 millilitres of 2 litres');
  // Undo from the toast takes back exactly that 150 ml.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(stat(page)).toContainText('1,230 millilitres of 2 litres');
  const list = page.getByRole('region', { name: 'Today’s drinks' }).or(page.locator('.entries'));
  await expect(list.getByRole('button')).toHaveCount(4);
  // Persistence after reload
  await page.reload();
  await expect(stat(page)).toContainText('1,230 millilitres of 2 litres');
});

test('daily rollover: past midnight Today starts fresh, and yesterday is in the Journal', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T23:58:00') });
  await onboard(page);
  await page.getByRole('button', { name: /Log 500 ml/ }).click();
  await expect(stat(page)).toContainText('500 millilitres of 2 litres');
  await page.clock.fastForward('05:00');
  await page.clock.runFor(2000);
  await expect(stat(page)).toContainText('0 millilitres of 2 litres', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(page.locator('.summary')).toContainText('2 days');
  await expect(page.locator('.days')).toContainText('500 ml');
});

test('Today: tapping Ripple gets a reaction, and a swipe over the spring scrolls the page instead of turning it', async ({
  page
}) => {
  test.setTimeout(150_000);
  const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  test.skip(!hasWebGL, 'No WebGL in this browser build.');
  // CI's Chromium draws WebGL on the CPU; ask for the live spring anyway (the app's "Show it anyway").
  await page.addInitScript(() => localStorage.setItem('wb-3d-anyway', '1'));
  await onboard(page, /18 to 64/, '/?dev');
  await expect(page.locator('.pond[data-live]')).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  const p = await page.evaluate(() => {
    const s = (
      window as unknown as {
        __pond: {
          camera: { position: { constructor: new (x: number, y: number, z: number) => { clone(): unknown } } };
          seatTop: { clone(): { add(v: unknown): { project(c: unknown): { x: number; y: number } } } };
          canvas: HTMLCanvasElement;
        };
      }
    ).__pond;
    const V = s.camera.position.constructor;
    const q = s.seatTop
      .clone()
      .add(new V(0, 0.75, 0))
      .project(s.camera);
    const r = s.canvas.getBoundingClientRect();
    return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height };
  });
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __pond: { buddyInfo: { playing: string | null } } }).__pond.buddyInfo.playing
      )
    )
    .not.toBeNull();
  const az0 = await page.evaluate(() => (window as unknown as { __pond: { orbit: { az: number } } }).__pond.orbit.az);
  await page.mouse.move(p.x, p.y + 40);
  await page.mouse.down();
  await page.mouse.move(p.x - 150, p.y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const az1 = await page.evaluate(() => (window as unknown as { __pond: { orbit: { az: number } } }).__pond.orbit.az);
  expect(Math.abs(az1 - az0)).toBeLessThan(0.01);
  await expect(stat(page)).toContainText('0 millilitres');
});

test('Journal: week and month progress, the spring, postcards and a line a day', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: /Log 500 ml/ }).click();
  await expect(stat(page)).toContainText('500 millilitres');
  await page.getByRole('button', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(page.locator('.summary')).toContainText('0 of 1 day at goal');
  await expect(page.locator('.summary')).toContainText('about 500 ml a day');
  await expect(page.locator('.month-strip li')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'The spring' })).toBeVisible();
  await expect(page.getByText(/Today’s quest: 0 of 4/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Postcards/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A line a day' })).toBeVisible();
});

test('You: the converter, wake and sleep times with quiet hours, and a reminder before waking is refused', async ({
  page
}) => {
  await onboard(page);
  await page.getByRole('button', { name: 'You', exact: true }).click();
  const conv = page.locator('.converter');
  await conv.getByLabel('Amount').fill('2');
  await expect(conv).toContainText('= 500 ml · 2 of your cups');
  await conv.getByLabel('Unit').selectOption('oz');
  await conv.getByLabel('Amount').fill('8');
  await expect(conv).toContainText('= 237 ml');
  await page.getByLabel('I usually wake up at').fill('08:30');
  await page.getByLabel('I usually wake up at').blur();
  await page.getByLabel('I usually go to sleep at').fill('23:00');
  await page.getByLabel('I usually go to sleep at').blur();
  await expect(page.getByText(/Quiet hours: 9:00 pm to 8:30 am/i)).toBeVisible();
  const remind = page.getByLabel('Remind me at');
  if (await remind.count()) {
    await remind.fill('07:30');
    await expect(page.getByText('That’s before you wake up. Pick a later time.')).toBeVisible();
  }
  await page.reload();
  await page.getByRole('button', { name: 'You', exact: true }).click();
  await expect(page.getByLabel('I usually wake up at')).toHaveValue('08:30');
});

test('the app is installable and its service worker caches Ripple for offline use', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
    return urls;
  });
  expect(cached).toContain('/models/buddy/ripple-waterbuddy.opt.glb');
  expect(cached).toContain('/ripple-poster.webp');
  expect(cached).not.toContain('/models/buddy/ripple-waterbuddy.glb');
});

for (const [name, size] of [
  ['small phone', { width: 360, height: 640 }],
  ['tablet', { width: 820, height: 1180 }],
  ['desktop', { width: 1366, height: 800 }]
] as const) {
  test(`responsive (${name}): every tab fits with no sideways scroll and nothing hidden under the tab bar`, async ({
    page
  }) => {
    await page.setViewportSize(size);
    await onboard(page);
    for (const tab of ['Today', 'Atlas', 'Journal', 'You']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth }));
      expect(r.overflow, `${tab} scrolls sideways`).toBeLessThanOrEqual(1);
    }
    await page.getByRole('button', { name: 'Atlas', exact: true }).click();
    const pour = await page.getByRole('button', { name: /^(Pour|Log) / }).boundingBox();
    const bar = await page.locator('.tabbar').boundingBox();
    expect(pour!.y + pour!.height).toBeLessThanOrEqual(bar!.y + 1);
  });
}
