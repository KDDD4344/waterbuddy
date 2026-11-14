import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The Hero Experience Lab (/lab/): a separate page with its own bundle.
// CI's Chromium draws WebGL on the CPU (SwiftShader, a few frames a second), and every pour
// takes its real 3.4 seconds, so these tests get a longer budget.
test.describe('Hero Lab', () => {
  test.describe.configure({ timeout: 120_000 });

  test('pours 250 ml, Ripple reacts, and only the approved Buddy is shown', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/lab/?dev');
    const canvas = page.locator('canvas.lab-canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('.lab-num')).toHaveText('750');

    await page.getByRole('button', { name: 'Pour 250 ml' }).click();
    await expect(page.getByRole('button', { name: 'Pouring…' })).toBeDisabled();
    await expect(page.locator('.lab-num')).toHaveText('1,000', { timeout: 15_000 });
    await expect(page.getByRole('status').filter({ hasText: 'Poured 250 ml' })).toHaveText(/1,000 ml of 2,000 ml/);
    await expect(page.getByRole('button', { name: 'Pour 250 ml' })).toBeEnabled();

    // Only the approved Buddy is in the experience: no concept picker.
    await expect(page.getByRole('radio')).toHaveCount(0);
    await page.getByRole('button', { name: /Lab tools/ }).click();
    for (const r of ['Happy', 'Curious', 'Celebrate']) await page.getByRole('button', { name: r, exact: true }).click();

    // Tapping the scene (a drag that doesn't move) must not throw.
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.35);
    expect(errors).toEqual([]);
  });

  test('reaching the goal is announced once, then logging stays quiet', async ({ page }) => {
    await page.goto('/lab/');
    const pour = page.getByRole('button', { name: /^(Pour|Log) 250 ml$/ });
    // 750 → 2,000 takes five glasses; the last one reaches the goal.
    for (let i = 0; i < 5; i++) {
      await pour.click();
      await expect(pour).toBeEnabled({ timeout: 15_000 });
    }
    await expect(page.locator('#lab-status')).toContainText("That's today's goal");
    await expect(page.getByText('Goal met for today')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Log 250 ml' })).toBeVisible();
    await pour.click();
    await expect(pour).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator('#lab-status')).toContainText("goal is already met, so there's no need for more");
    // Still counted exactly, but the button no longer invites more.
    await expect(page.locator('.lab-num')).toHaveText('2,250');
    await expect(page.getByRole('button', { name: 'Log 250 ml' })).toHaveAttribute('data-calm', 'true');
    // Six glasses inside an hour is over the sip guard's litre.
    await expect(page.getByText('Sip, don’t rush')).toBeVisible();
  });

  test('has no WCAG 2.2 A/AA violations and fits the phone without sideways scroll', async ({ page }) => {
    await page.goto('/lab/?dev');
    await expect(page.locator('canvas.lab-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Lab tools/ }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Ripple is the supplied GLB, with all four clips playable', async ({ page }) => {
    // The page loads the compressed copy of the supplied file (same nodes, skeleton and clips).
    const glb = page.waitForResponse((r) => r.url().endsWith('/models/buddy/ripple-waterbuddy.opt.glb'));
    await page.goto('/lab/?dev');
    expect((await glb).status()).toBe(200);
    await page.waitForFunction(
      () =>
        (window as unknown as { __heroLab?: { buddyInfo: { state: string } } }).__heroLab?.buddyInfo.state === 'ready'
    );
    const info = await page.evaluate(
      () =>
        (window as unknown as { __heroLab: { buddyInfo: { stats: { clips: { name: string }[]; bones: number } } } })
          .__heroLab.buddyInfo.stats
    );
    expect(info.clips.map((c) => c.name)).toEqual(['idle', 'happy', 'curious', 'celebrate']);
    expect(info.bones).toBe(8);
    expect((info as unknown as { file: string }).file).toBe('ripple-waterbuddy.opt.glb');
    await expect(page.getByText('Ripple is on the way…')).toHaveCount(0);
    await page.getByRole('button', { name: /Lab tools/ }).click();
    const playing = () =>
      page.evaluate(
        () =>
          (window as unknown as { __heroLab: { buddyInfo: { playing: string | null } } }).__heroLab.buddyInfo.playing
      );
    for (const clip of ['happy', 'curious', 'celebrate']) {
      await page.getByRole('button', { name: clip[0]!.toUpperCase() + clip.slice(1), exact: true }).click();
      await expect.poll(playing).toBe(clip);
      // Each reaction hands back to idle by itself.
      await expect.poll(playing, { timeout: 20_000 }).toBeNull();
    }
  });

  test('if the compressed copy fails, the original file loads instead', async ({ page }) => {
    await page.route('**/models/buddy/ripple-waterbuddy.opt.glb', (r) => r.abort());
    await page.goto('/lab/?dev');
    await page.waitForFunction(
      () =>
        (window as unknown as { __heroLab?: { buddyInfo: { state: string } } }).__heroLab?.buddyInfo.state === 'ready',
      null,
      { timeout: 60_000 }
    );
    const file = await page.evaluate(
      () =>
        (window as unknown as { __heroLab: { buddyInfo: { stats: { file: string } } } }).__heroLab.buddyInfo.stats.file
    );
    expect(file).toBe('ripple-waterbuddy.glb');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('if the GLB fails to load, logging still works and Try again recovers', async ({ page }) => {
    // Both the compressed copy and the original.
    await page.route('**/models/buddy/ripple-waterbuddy*.glb', (r) => r.abort());
    await page.goto('/lab/');
    // The scene builds before the load starts; CPU-rendered CI is slow, so allow time.
    await expect(page.getByRole('alert')).toContainText('Ripple couldn’t load', { timeout: 20_000 });
    const pour = page.getByRole('button', { name: 'Pour 250 ml' });
    await pour.click();
    await expect(page.locator('.lab-num')).toHaveText('1,000', { timeout: 15_000 });
    await page.unroute('**/models/buddy/ripple-waterbuddy*.glb');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 });
  });

  test('looking around and touching things never changes the water logged', async ({ page }) => {
    await page.goto('/lab/?dev');
    await page.waitForFunction(
      () =>
        (window as unknown as { __heroLab?: { buddyInfo: { state: string } } }).__heroLab?.buddyInfo.state === 'ready',
      null,
      { timeout: 60_000 }
    );
    const saved = () => page.evaluate(() => localStorage.getItem('wb-lab-day'));
    const before = await saved();
    // Screen positions of Ripple, a lily pad, the spout's end and open water.
    const spots = await page.evaluate(() => {
      type V3 = {
        clone(): V3;
        add(v: V3): V3;
        addScaledVector(v: V3, k: number): V3;
        project(c: unknown): V3;
        x: number;
        y: number;
      };
      const s = (window as unknown as { __heroLab: Record<string, never> }).__heroLab as unknown as {
        camera: { position: { constructor: new (x: number, y: number, z: number) => V3 } };
        seatTop: V3;
        level: number;
        world: { spout: { mouth: V3; dir: V3 } };
        life: { lilies: { group: { position: V3 } }[] };
        canvas: HTMLCanvasElement;
      };
      const V = s.camera.position.constructor;
      const r = s.canvas.getBoundingClientRect();
      const at = (p: V3) => {
        const q = p.clone().project(s.camera);
        return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height };
      };
      return {
        ripple: at(s.seatTop.clone().add(new V(0, 0.75, 0))),
        pad: at(s.life.lilies[3]!.group.position),
        spout: at(s.world.spout.mouth.clone().addScaledVector(s.world.spout.dir, -0.25)),
        water: at(new V(0.9, s.level, 1.0))
      };
    });
    for (const p of Object.values(spots)) {
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(300);
    }
    // A long press on the water, a drag and a scroll.
    await page.mouse.move(spots.water.x, spots.water.y);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    const box = (await page.locator('canvas.lab-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height * 0.45, { steps: 8 });
    await page.mouse.up();
    // A scroll to zoom (dispatched on the canvas: mobile WebKit has no wheel input in tests).
    await page.locator('canvas.lab-canvas').dispatchEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true });
    await page.waitForTimeout(500);
    await expect(page.locator('.lab-num')).toHaveText('750');
    expect(await saved()).toBe(before);
    expect(
      await page.evaluate(() => (window as unknown as { __heroLab: { pouring: boolean } }).__heroLab.pouring)
    ).toBe(false);
  });

  test('a logged glass survives a reload, and Undo takes it back', async ({ page }) => {
    await page.goto('/lab/');
    await page.getByRole('button', { name: 'Pour 250 ml' }).click();
    await expect(page.locator('.lab-num')).toHaveText('1,000', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.reload();
    await expect(page.locator('.lab-num')).toHaveText('1,000');
    await page.getByRole('button', { name: 'Pour 250 ml' }).click();
    await expect(page.locator('.lab-num')).toHaveText('1,250', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.lab-num')).toHaveText('1,000');
    await expect(page.locator('#lab-status')).toContainText('Undone. 1,000 ml of 2,000 ml');
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.lab-num')).toHaveText('1,000');
  });

  test('a double-click on Pour logs one glass, and Undo removes exactly that glass', async ({ page }) => {
    await page.goto('/lab/');
    const day = () => page.evaluate(() => JSON.parse(localStorage.getItem('wb-lab-day') ?? '{}'));
    const before = (await day()).logs?.length ?? 3;
    await page.getByRole('button', { name: 'Pour 250 ml' }).dblclick();
    await expect(page.locator('.lab-num')).toHaveText('1,000', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    const logged = await day();
    expect(logged.logs).toHaveLength(before + 1);
    expect(logged.logs.at(-1).ml).toBe(250);
    await page
      .getByRole('button', { name: 'Undo' })
      .dblclick({ force: true })
      .catch(() => {});
    await expect(page.locator('.lab-num')).toHaveText('750');
    expect((await day()).logs).toHaveLength(before);
  });

  test('two open tabs keep each other’s glasses', async ({ page, context }) => {
    await page.goto('/lab/');
    const other = await context.newPage();
    await other.goto('/lab/');
    await page.getByRole('button', { name: 'Pour 250 ml' }).click();
    await expect(page.locator('.lab-num')).toHaveText('1,000', { timeout: 15_000 });
    // The other tab picks it up, and its own glass adds to it.
    await expect(other.locator('.lab-num')).toHaveText('1,000');
    await other.getByRole('button', { name: 'Pour 250 ml' }).click();
    await expect(other.locator('.lab-num')).toHaveText('1,250', { timeout: 15_000 });
    await expect(page.locator('.lab-num')).toHaveText('1,250');
    await page.reload();
    await expect(page.locator('.lab-num')).toHaveText('1,250');
  });

  test('the guide retires once someone has looked around and touched something', async ({ page }) => {
    await page.goto('/lab/?dev');
    const guide = page.getByRole('region', { name: 'Explore the spring' });
    await expect(guide).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as { __heroLab?: { buddyInfo: { state: string } } }).__heroLab?.buddyInfo.state === 'ready',
      null,
      { timeout: 60_000 }
    );
    // Look around with the keyboard, then tap open water (projected from the scene).
    await page.locator('.lab-stage').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(800);
    const water = await page.evaluate(() => {
      type V3 = { project(c: unknown): V3; x: number; y: number };
      const s = (window as unknown as { __heroLab: unknown }).__heroLab as {
        camera: { position: { constructor: new (x: number, y: number, z: number) => V3 } };
        level: number;
        canvas: HTMLCanvasElement;
      };
      const q = new s.camera.position.constructor(0.9, s.level, 1.0).project(s.camera);
      const r = s.canvas.getBoundingClientRect();
      return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height };
    });
    await page.mouse.click(water.x, water.y);
    await expect(guide).toContainText('1 of 4 found');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Pour 250 ml' })).toBeVisible();
    await expect(guide).toHaveCount(0);
  });

  test('the first-visit guide can be dismissed and reopened from the menu', async ({ page }) => {
    await page.goto('/lab/');
    const guide = page.getByRole('region', { name: 'Explore the spring' });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText('Only the Pour button logs water.');
    await guide.getByRole('button', { name: 'Got it' }).click();
    await expect(guide).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Pour 250 ml' })).toBeVisible();
    await expect(guide).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'How to explore' }).click();
    await expect(guide).toBeVisible();
  });

  test('the consumer view hides the lab tools unless ?dev is set', async ({ page }) => {
    // Tester overrides and the frame meter are ignored without ?dev, and no hooks are exposed.
    await page.goto('/lab/?q=low&perf&dpr=1');
    await expect(page.getByRole('button', { name: 'Pour 250 ml' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Lab tools/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Happy', exact: true })).toHaveCount(0);
    await expect(page).toHaveTitle('WaterBuddy');
    expect(await page.evaluate(() => 'heroLab' in window || '__heroLab' in window)).toBe(false);
    await expect(page.locator('.perf-meter')).toHaveCount(0);
  });

  test('the app itself is unchanged at /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.locator('canvas.lab-canvas')).toHaveCount(0);
  });
});
