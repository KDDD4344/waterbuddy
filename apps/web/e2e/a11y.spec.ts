import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Accessibility audit (Phase 8): axe-core checks every screen against WCAG 2.2 A and AA, in
// both engines, at standard and the largest text size. Screen reader and switch control
// passes still need people; see docs/accessibility.md.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, where: string) {
  // Let entrance animations finish so colours are read at rest (endless ones, like the
  // bobbing bottle, are skipped).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined))
    )
  );
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${where}: ${v.id} (${v.impact}) ${v.help}\n    ${v.nodes.map((n) => `${n.target.join(' ')}: ${(n.failureSummary ?? '').split('\n').slice(1, 2).join('').trim()}`).join('\n    ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

/** No sideways scrolling: WCAG 1.4.10 reflow, at the phone's own width. */
async function noSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${where} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
}

async function onboard(page: Page, age = /18 to 64/) {
  await page.goto('/');
  await audit(page, 'welcome');
  await page.getByRole('button', { name: 'Let’s set up' }).click();
  await page.getByRole('radio', { name: age }).check();
  const parent = page.getByRole('checkbox', { name: /parent or guardian/ });
  if (await parent.isVisible()) await parent.check();
  await audit(page, 'age step');
  await page.getByRole('button', { name: 'Next' }).click();
  await audit(page, 'goal step');
  await page.getByRole('button', { name: 'Next' }).click();
  await audit(page, 'vessels step');
  await page.getByRole('button', { name: 'Start filling' }).click();
  await expect(page.getByRole('button', { name: /Log 250 ml/ })).toBeVisible();
}

async function tabs(page: Page, label: string) {
  for (const tab of ['Today', 'Atlas', 'Journal', 'You']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await audit(page, `${tab} (${label})`);
    await noSidewaysScroll(page, `${tab} (${label})`);
  }
}

test('onboarding and every tab pass axe', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'How your data is handled' }).click();
  await audit(page, 'privacy notice');
  await page.getByRole('button', { name: 'Close' }).click();
  await onboard(page);
  await page.getByRole('button', { name: /Log 250 ml/ }).click();
  await tabs(page, 'standard text');
});

test('the largest text with high contrast still passes, with no sideways scrolling', async ({ page }) => {
  test.setTimeout(90_000);
  await onboard(page, /65 or older/);
  await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
  await page.getByRole('button', { name: 'You', exact: true }).click();
  await page.getByRole('combobox', { name: /Text size/ }).selectOption('larger');
  // Saved asynchronously, so click and then wait for the stored value to come back.
  const contrast = page.getByRole('checkbox', { name: /High contrast/ });
  await contrast.click();
  await expect(contrast).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await tabs(page, 'larger, high contrast');
});

test('sheets pass axe: logging, goal, and kid mode’s grown-up question', async ({ page }) => {
  test.setTimeout(90_000);
  await onboard(page, /4 to 8/);
  await page.getByRole('button', { name: /Custom amount/ }).click();
  await audit(page, 'custom amount sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'You', exact: true }).click();
  await page.getByRole('button', { name: 'Change' }).click();
  const gate = page.getByRole('dialog', { name: 'Ask a grown-up' });
  await expect(gate).toBeVisible();
  await audit(page, 'parent check');
  const q = (await gate.locator('label').first().textContent()) ?? '';
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const [, a, b] = q.match(/What is (\w+) times (\w+)\?/) ?? [];
  await gate.getByRole('textbox').fill(String(words.indexOf(a!) * words.indexOf(b!)));
  await gate.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('dialog', { name: 'Daily goal' })).toBeVisible();
  await audit(page, 'goal sheet');
});

test('a postcard passes axe, front and back', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
  await onboard(page);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /Log 500 ml/ }).click();
    // Taps at a person's pace: a repeat within 0.6 s counts as an accidental double tap.
    await page.waitForTimeout(700);
  }
  await expect(page.getByLabel("Today's progress")).toContainText('Goal reached');
  await page.clock.setFixedTime(new Date('2026-11-11T07:30:00'));
  await page.reload();
  await page.getByRole('button', { name: 'A message washed up. Open it' }).click({ force: true });
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Postcard 1 of 6' })).toBeVisible();
  await audit(page, 'postcard front');
  await sheet.getByRole('button', { name: 'Turn it over' }).click();
  await expect(sheet.getByText(/The islands here float!/)).toBeVisible();
  await page.waitForTimeout(800);
  await audit(page, 'postcard back');
});
