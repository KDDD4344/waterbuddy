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
