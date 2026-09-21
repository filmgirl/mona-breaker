import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import { cabinetRoot, cabinetSha, candidateCatalog, origin } from '../scripts/cabinet.mjs';

const candidate = `${origin}/mona-breaker/`;
const SIBLING_STUB = '<!doctype html><title>Sibling stub</title><p>Sibling game stub</p>';

const test = base.extend({
  page: async ({ page }, use) => {
    const failures = [];
    const failed = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', (request) => failed.push(request));
    // Sibling games are isolated so lifecycle tests do not depend on the network.
    await page.route('https://filmgirl.github.io/**', (route) => route.fulfill({ contentType: 'text/html', body: SIBLING_STUB }));
    await use(page);
    for (const request of failed) {
      const reason = request.failure()?.errorText;
      if (request.isNavigationRequest() && request.frame().isDetached() && ['net::ERR_ABORTED', 'cancelled'].includes(reason)) continue;
      failures.push(`${reason} ${request.url()}`);
    }
    expect(failures, 'No uncaught errors, console errors, or failed requests').toEqual([]);
  },
});

const card = (page) => page.getByRole('button', { name: 'Play Mona Breaker', exact: true });
const stageData = (frame, key) => frame.locator('#stage').getAttribute(`data-${key}`);

async function readyGame(page) {
  const iframe = page.locator('#frame-host iframe');
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toHaveAttribute('src', candidate);
  await expect.poll(() => page.frames().find((f) => f.url() === candidate)?.url()).toBe(candidate);
  const frame = page.frames().find((f) => f.url() === candidate);
  await expect.poll(() => stageData(frame, 'status'), { timeout: 30_000 }).toBe('ready');
  // A blank WebGL canvas compresses to almost nothing; a rendered board does not.
  await expect.poll(async () => (await frame.locator('#scene').screenshot()).length, { message: 'WebGL board rendered', timeout: 30_000 }).toBeGreaterThan(20_000);
  return frame;
}

async function launchWithSpace(page, frame) {
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press('Space');
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  await expect(page.locator('#frame-host iframe')).toBeFocused();
  expect(await page.evaluate(() => scrollY), 'Space does not scroll the cabinet').toBe(scroll);
  expect(await frame.evaluate(() => scrollY), 'Space does not scroll the game document').toBe(0);
  const y = Number(await stageData(frame, 'ball-y'));
  await expect.poll(async () => Number(await stageData(frame, 'ball-y')), { message: 'ball travels' }).not.toBe(y);
}

test.beforeEach(async ({ page, request }) => {
  expect(await (await request.get('/health')).json()).toEqual({ cabinetSha });
  const served = await request.get(candidate);
  expect(served.ok()).toBeTruthy();
  expect(await served.text()).toBe(await readFile('_site/index.html', 'utf8'));
  await page.goto('/arcade/');
  await expect(card(page)).toBeVisible();
});

test('serves the real pinned cabinet with only the Mona Breaker entry changed', async ({ request }) => {
  const original = JSON.parse(await readFile(`${cabinetRoot}/games.json`, 'utf8'));
  expect(await (await request.get('/arcade/games.json')).json()).toEqual(candidateCatalog(original));
  for (const file of ['index.html', 'styles.css', 'src/app.js', 'src/catalog.js']) {
    expect(await (await request.get(`/arcade/${file}`)).text()).toBe(await readFile(`${cabinetRoot}/${file}`, 'utf8'));
  }
});

for (const launch of ['mouse', 'keyboard']) {
  test(`${launch} launch: Space, arrows, pause and mute reach the game; reload and return clean up`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard coverage runs on desktop.');
    if (launch === 'mouse') await card(page).click();
    else { await card(page).focus(); await page.keyboard.press('Enter'); }
    let frame = await readyGame(page);
    await expect(page.locator('#frame-host iframe')).toBeFocused();
    await launchWithSpace(page, frame);

    const x = Number(await stageData(frame, 'paddle-x'));
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeLessThan(x - 1);
    await page.keyboard.up('ArrowLeft');
    const left = Number(await stageData(frame, 'paddle-x'));
    await page.keyboard.down('d');
    await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeGreaterThan(left + 1);
    await page.keyboard.up('d');

    for (const key of ['p', 'Escape']) {
      await page.keyboard.press(key);
      await expect.poll(() => stageData(frame, 'status')).toBe('paused');
      const y = await stageData(frame, 'ball-y');
      await page.waitForTimeout(250);
      expect(await stageData(frame, 'ball-y')).toBe(y);
      await expect(frame.locator('#message')).toBeVisible();
      await page.keyboard.press(key === 'p' ? 'p' : 'Space');
      await expect.poll(() => stageData(frame, 'status')).toBe('playing');
    }

    await page.keyboard.press('m');
    await expect(frame.locator('#music')).toHaveAttribute('aria-pressed', 'false');
    await expect(frame.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('m');
    await expect(frame.locator('#music')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#reload-game').click();
    await expect.poll(() => frame.isDetached()).toBe(true);
    frame = await readyGame(page);
    await launchWithSpace(page, frame);
    await page.locator('#return-button').click();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(card(page)).toBeFocused();
    expect(frame.isDetached()).toBe(true);
  });
}

test('in-game buttons keep Space for the game and toggle their own settings', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard coverage runs on desktop.');
  await card(page).click();
  const frame = await readyGame(page);
  await frame.locator('#primary').click();
  await expect.poll(() => stageData(frame, 'status')).toBe('serving');
  await frame.locator('#theme').click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  const theme = await frame.locator('html').getAttribute('data-theme');
  await frame.locator('#sound').focus();
  await page.keyboard.press('Space');
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  await expect(frame.locator('#sound'), 'Space did not activate the focused button').toHaveAttribute('aria-pressed', 'true');
  await frame.locator('#theme').click();
  await expect(frame.locator('html')).not.toHaveAttribute('data-theme', theme);
  await expect(frame.locator('html')).toHaveAttribute('data-theme', /dark|light/);
  await frame.locator('#help').click();
  await expect(frame.locator('#help-dialog')).toBeVisible();
  await expect.poll(() => stageData(frame, 'status')).toBe('paused');
  await frame.locator('#close-help').click();
  await expect(frame.locator('#help-dialog')).toBeHidden();
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
  await frame.locator('#help').click();
  await page.keyboard.press('Escape');
  await expect(frame.locator('#help-dialog')).toBeHidden();
  await expect.poll(() => stageData(frame, 'status')).toBe('playing');
});

test('switching to another game detaches the Mona Breaker frame', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Lifecycle coverage runs on desktop.');
  await card(page).click();
  const frame = await readyGame(page);
  await launchWithSpace(page, frame);
  await page.goto('/arcade/#game/mona-maze');
  await expect(page.locator('#frame-host iframe')).toHaveCount(1);
  await expect(page.locator('#frame-host iframe')).toHaveAttribute('src', 'https://filmgirl.github.io/mona-maze/');
  await expect.poll(() => frame.isDetached()).toBe(true);
  await page.goBack();
  await expect(page.locator('#frame-host iframe')).toHaveAttribute('src', candidate);
});

for (const width of [320, 390]) {
  test(`touch at ${width}px: no overflow, tap launches, drag steers, controls reachable`, async ({ page, isMobile, browserName }) => {
    test.skip(!isMobile, 'Touch coverage runs on the mobile project.');
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/arcade/#game/mona-breaker');
    const frame = await readyGame(page);
    for (const doc of [page, frame]) {
      const overflow = await doc.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, 'No horizontal overflow').toBeLessThanOrEqual(0);
    }
    const stage = frame.locator('#stage');
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    await frame.locator('#primary').tap();
    await expect.poll(() => stageData(frame, 'status')).toBe('serving');
    await stage.tap({ position: { x: box.width / 2, y: box.height * 0.6 } });
    await expect.poll(() => stageData(frame, 'status')).toBe('playing');

    const before = Number(await stageData(frame, 'paddle-x'));
    const inner = await stage.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    if (browserName === 'chromium') {
      // Real touch input through the cabinet page and into the iframe.
      const session = await page.context().newCDPSession(page);
      const frameBox = await page.locator('#frame-host iframe').boundingBox();
      const at = (fx) => [{ x: frameBox.x + inner.x + inner.w * fx, y: frameBox.y + inner.y + inner.h * 0.7 }];
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0.5) });
      for (const fx of [0.45, 0.35, 0.25, 0.15]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(fx) });
      await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeLessThan(before - 1);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      // WebKit has no CDP touch stream; dispatch touch-typed pointer events to the canvas.
      await frame.locator('#scene').evaluate((el, box) => {
        const fire = (type, fx) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
          clientX: box.x + box.w * fx, clientY: box.y + box.h * 0.7 }));
        fire('pointerdown', 0.5);
        for (const fx of [0.45, 0.35, 0.25, 0.15]) fire('pointermove', fx);
        fire('pointerup', 0.15);
      }, inner);
      await expect.poll(async () => Number(await stageData(frame, 'paddle-x'))).toBeLessThan(before - 1);
    }
    expect(await stageData(frame, 'status'), 'a drag is not a pause or relaunch').toBe('playing');

    for (const id of ['theme', 'music', 'sound', 'help', 'new-game', 'pause', 'fx-actions', 'percentage']) {
      const control = frame.locator(`#${id}`);
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      const r = await control.evaluate((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right }; });
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(width + 1);
    }
    await frame.locator('#pause').tap();
    await expect.poll(() => stageData(frame, 'status')).toBe('paused');
  });
}

test('reduced motion still plays', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Runs once on desktop.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card(page).click();
  const frame = await readyGame(page);
  await launchWithSpace(page, frame);
});
