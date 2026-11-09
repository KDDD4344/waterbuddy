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
