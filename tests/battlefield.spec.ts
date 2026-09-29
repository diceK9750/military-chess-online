import { expect, test, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { sitePoint } from '../src/battlefield3d/state';
import type { Site } from '../src/game/types';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const canvasName = '操作可能な三次元戦場';
const entry = process.env.BATTLEFIELD_TEST_URL ?? '/';
test('responsive resizing does not cause ResizeObserver errors', async ({ page }) => {
  await page.addInitScript(() => {
    const errors: string[] = [];
    Object.assign(window, { battlefieldResizeErrors: errors });
    window.addEventListener('error', event => { errors.push(event.message); });
  });
  await start(page);
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  for (const [width, height] of [[1920,1080], [1440,900], [1280,720], [390,844], [430,932], [1440,900], [844,390]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  expect(await page.evaluate(() => (window as unknown as { battlefieldResizeErrors: string[] }).battlefieldResizeErrors)).toEqual([]);
});
async function start(page: Page) {
  await page.goto(entry);
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
}
async function point(page: Page, site: Site, height = 0.31) {
  const canvas = page.getByRole('img', { name: canvasName });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(42, box.width / box.height, 0.1, 100);
  const distance = Math.min(30, Math.max(13, 11 / camera.aspect));
  camera.position.set(0, distance * .78, distance * .7); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const world = sitePoint(site), position = new Vector3(world.x, height, world.z).project(camera);
  return { x: box.x + (position.x + 1) * box.width / 2, y: box.y + (1 - position.y) * box.height / 2 };
}
async function tap(page: Page, site: Site, touch: boolean) {
  const position = await point(page, site);
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
}
async function move2d(page: Page) {
  const own = page.locator('.cell.side-1');
  for (let i = 0; i < await own.count(); i++) {
    await own.nth(i).click(); if (await page.locator('.cell.legal').count()) break;
  }
  await page.locator('.cell.legal').first().click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
}
async function synchronized(page: Page) {
  const pieces = await page.locator('.cell.side-1, .cell.side-2').evaluateAll(cells => cells.map(cell => {
    const own = cell.classList.contains('side-1');
    return cell.getAttribute('data-site') + ' ' + (own ? '自軍' : '敵軍') + ' ' + (own ? cell.querySelector('.piece-name')!.textContent : '不明');
  }).sort());
  expect((await page.getByRole('list', { name: '三次元表示中の駒' }).locator('li').allTextContents()).sort()).toEqual(pieces);
}
for (const [width, height] of [[1920,1080], [1440,900], [1280,720], [430,932], [390,844]]) {
  test('persistent interactive battlefield ' + width + 'x' + height, async ({ page, isMobile }, info) => {
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    await page.setViewportSize({ width, height });
    await page.goto(entry);
    await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
    await page.getByRole('button', { name: /^かんたん/ }).click();
    expect(requests.some(url => /battlefield3d\/renderer|renderer-/.test(url))).toBe(false);
    await page.getByRole('button', { name: 'この配置で確定' }).click();
    await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
    const canvas = page.getByRole('img', { name: canvasName });
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: '戦場ビュー' })).toHaveCount(0);
    await page.waitForTimeout(350); // Wait for the bounded initial CPU transition.
    await synchronized(page);
    const before = Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''));
    const ownSites = await page.locator('.cell.side-1').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-site')!));
    for (const site of ownSites) {
      await tap(page, site as Site, !!isMobile);
      if (await page.locator('.cell.legal').count()) break;
    }
    const source = await page.locator('.cell.selected').getAttribute('data-site');
    expect(source).toBeTruthy();
    await expect(page.locator('.battlefield-selection')).toContainText(source!);
    const target = await page.locator('.cell.legal').first().getAttribute('data-site') as Site;
    await tap(page, target, !!isMobile);
    await expect(page.locator('.battlefield-selection')).toContainText(target + 'へ移動予定');
    expect(Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before);
    await tap(page, target, !!isMobile);
    await expect.poll(async () => Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before + 2);
    await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
    await page.waitForTimeout(350);
    await synchronized(page);
    await page.locator('.cell.side-1').first().click();
    const selected = await page.locator('.cell.selected').getAttribute('data-site');
    await expect(page.locator('.battlefield-selection')).toContainText(selected!);
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1400) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
      expect((await page.locator('.board').boundingBox())!.width).toBeGreaterThanOrEqual(460);
      await expect(page.getByRole('complementary', { name: '基本ルール' })).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath('persistent-' + width + '.png'), fullPage: true });
    await move2d(page);
    await expect.poll(async () => Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before + 4);
    await page.reload();
    await page.getByRole('button', { name: /続きから/ }).click();
    await expect(canvas).toBeVisible();
    await synchronized(page);
    expect(Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before + 4);
    expect(errors).toEqual([]);
  });
}
test('HQ paths require a lane and raycast path selection saves the chosen lane', async ({ page }) => {
  await page.goto(entry);
  await page.getByText('開発用・将来の機能').click();
  await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await page.getByText('検証用の盤面を開く', { exact: true }).click();
  await page.getByRole('button', { name: '飛行機のC/D経路' }).click();
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  await tap(page, 'HQ-P1', false);
  await tap(page, 'HQ-P2', false);
  await tap(page, 'HQ-P2', false);
  await expect(page.getByRole('button', { name: '確定して実行' })).toBeDisabled();
  const lane = await point(page, 'D4', .72);
  await page.mouse.click(lane.x, lane.y);
  await expect(page.getByRole('radio', { name: 'D列を通る' })).toBeChecked();
  await tap(page, 'HQ-P2', false);
  await expect(page.locator('.latest-event')).toContainText('（D列）');
  await expect(page.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeVisible();
});
test('camera drag cannot select or commit; reset and repeated mounts release WebGL', async ({ page }) => {
  await start(page);
  const canvas = page.getByRole('img', { name: canvasName });
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(350);
  const count = await page.locator('.badge').first().textContent();
  const position = await point(page, 'B4');
  await page.mouse.move(position.x, position.y); await page.mouse.down();
  await page.mouse.move(position.x + 80, position.y + 30, { steps: 8 }); await page.mouse.up();
  expect(await page.locator('.cell.selected').count()).toBe(0);
  expect(await page.locator('.badge').first().textContent()).toBe(count);
  await page.getByRole('button', { name: '視点を戻す' }).click();
  for (let i = 0; i < 3; i++) {
    const gl = await canvas.evaluateHandle(element => (element as HTMLCanvasElement).getContext('webgl2')!);
    await page.getByRole('button', { name: 'タイトルへ', exact: true }).click();
    expect(await gl.evaluate(context => context.isContextLost())).toBe(true);
    await gl.dispose();
    await page.getByRole('button', { name: /続きから/ }).click();
    await expect(canvas).toBeVisible();
    expect(await page.locator('.battlefield-stage canvas').count()).toBe(1);
  }
});
test('unsupported WebGL leaves 2D play available', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await start(page);
  await expect(page.getByRole('alert')).toContainText('二次元盤面で続けられます');
  await move2d(page);
});
test('failed lazy download leaves 2D play available', async ({ page }) => {
  await page.route('**/src/battlefield3d/renderer.ts*', route => route.abort());
  await start(page);
  await expect(page.getByRole('alert')).toContainText('二次元盤面で続けられます');
  await move2d(page);
});
test('touch camera gestures do not select, canvas retains scroll, and idle rendering stops', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = requestAnimationFrame;
    const counters = { frames: 0 };
    Object.assign(window, { battlefieldTestFrames: counters });
    window.requestAnimationFrame = callback => original(time => { counters.frames++; callback(time); });
  });
  await start(page);
  const canvas = page.getByRole('img', { name: canvasName });
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const before = await page.evaluate(() => scrollY);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 55, y: y + 20, id: 1 }, { x: x + 55, y: y - 20, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.locator('.cell.selected').count()).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
  await page.getByRole('button', { name: '視点を戻す' }).click();
  await page.waitForTimeout(450);
  const frames = () => page.evaluate(() => (window as unknown as { battlefieldTestFrames: { frames: number } }).battlefieldTestFrames.frames);
  const settled = await frames();
  await page.waitForTimeout(150);
  expect(await frames()).toBe(settled);
  const scrollBeforeWheel = await page.evaluate(() => scrollY);
  await page.mouse.move(5, 600); await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBeforeWheel);
});
