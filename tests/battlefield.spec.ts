import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { sitePoint } from '../src/battlefield3d/state';
import type { Site } from '../src/game/types';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const canvasName = '操作可能な三次元戦場';
const entry = process.env.BATTLEFIELD_TEST_URL ?? '/';
const setupKey = 'military-chess:cpu-setup:v1';

async function trackBoard(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { normalBoardMounted: false });
    new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches('.board') || node.querySelector('.board'))))) {
        Object.assign(window, { normalBoardMounted: true });
      }
    }).observe(document, { childList: true, subtree: true });
  });
}
async function noBoardEver(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { normalBoardMounted: boolean }).normalBoardMounted)).toBe(false);
  await expect(page.locator('.board')).toHaveCount(0);
}
async function setupSaved(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), setupKey);
}
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
async function point(page: Page, site: Site, height = 0.31, preset: 'full' | 'top' = 'full') {
  const canvas = page.getByRole('img', { name: canvasName });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(42, box.width / box.height, 0.1, 100);
  const distance = Math.min(30, Math.max(13, 11 / camera.aspect));
  if (preset === 'top') camera.position.set(0, Math.min(34, Math.max(13, 10 / camera.aspect)), .001);
  else camera.position.set(0, distance * .78, distance * .7);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
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
  const pieces = await page.evaluate(() => {
    const match = JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!);
    return match.game.pieces.filter((p: {position: string | null}) => p.position).map((p: {position: string; owner: number}) => p.position + ' ' + (p.owner === 1 ? '自軍' : '敵軍')).sort();
  });
  const visible = await page.getByRole('list', { name: '三次元表示中の駒' }).locator('li').allTextContents();
  expect(visible.map(text => text.split(' ').slice(0,2).join(' ')).sort()).toEqual(pieces);
  expect(visible.filter(text => text.includes('敵軍')).every(text => text.endsWith('不明'))).toBe(true);
  await expect(page.locator('.board')).toHaveCount(0);
}
async function choose3d(page: Page, touch = false): Promise<Site> {
  const pieces = await page.getByRole('list', { name: '三次元表示中の駒' }).locator('li').allTextContents();
  for (const line of pieces.filter(text => text.includes('自軍'))) {
    await tap(page, line.split(' ')[0] as Site, touch);
    if (await page.locator('[data-target]').count()) return await page.locator('[data-target]').first().getAttribute('data-target') as Site;
  }
  throw new Error('No legal target found using 3D picking');
}
async function move3d(page: Page, touch: boolean) {
  const target = await choose3d(page, touch);
  await tap(page, target, touch);
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  await page.waitForTimeout(350);
}
for (const [width, height] of [[1920,1080], [1440,900], [1280,720], [430,932], [390,844]]) {
  test('persistent interactive battlefield ' + width + 'x' + height, async ({ page, isMobile }, info) => {
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    await trackBoard(page);
    await page.setViewportSize({ width, height });
    await page.goto(entry);
    await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
    expect(requests.some(url => /battlefield3d\/renderer|renderer-/.test(url))).toBe(false);
    await page.getByRole('button', { name: /^かんたん/ }).click();
    await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
    await expect(page.locator('.board')).toHaveCount(0);
    await expect(page.getByRole('list', { name: '三次元表示中の駒' }).locator('li')).toHaveCount(23);
    await expect(page.getByRole('list', { name: '三次元表示中の駒' })).not.toContainText('敵軍');
    const originalSetup = await setupSaved(page);
    await tap(page, 'B1', !!isMobile);
    await expect(page.locator('.selection-panel')).toContainText('（B1）・交換可能');
    await expect(page.getByRole('button', { name: '選択中の駒', exact: true })).toBeEnabled();
    await tap(page, 'E1', !!isMobile);
    await expect(page.locator('.notice')).toContainText('入れ替え、ブラウザへ保存');
    const editedSetup = await setupSaved(page);
    expect(editedSetup.pieces).toEqual(originalSetup.pieces.map((piece: { position: Site }) => ({ ...piece, position: piece.position === 'B1' ? 'E1' : piece.position === 'E1' ? 'B1' : piece.position })));
    expect(editedSetup.cpuSeed).toBe(originalSetup.cpuSeed);
    expect(editedSetup.difficulty).toBe(originalSetup.difficulty);
    const visibleSetup = await page.getByRole('list', { name: '三次元表示中の駒' }).textContent();
    await page.getByRole('button', { name: '真上', exact: true }).click();
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1400) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
    await page.screenshot({ path: info.outputPath('setup-top-' + width + '.png'), fullPage: true });
    await page.getByRole('button', { name: '全景', exact: true }).click();
    await page.screenshot({ path: info.outputPath('setup-full-' + width + '.png'), fullPage: true });
    await noBoardEver(page);
    await page.reload();
    await page.getByRole('button', { name: /続きから/ }).click();
    await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
    await expect(page.getByRole('list', { name: '三次元表示中の駒' })).toHaveText(visibleSetup!);
    expect(await setupSaved(page)).toEqual(editedSetup);
    await page.getByRole('button', { name: 'この配置で確定' }).click();
    await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
    const canvas = page.getByRole('img', { name: canvasName });
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: '戦場ビュー' })).toHaveCount(0);
    await page.waitForTimeout(350); // Wait for the bounded initial CPU transition.
    await synchronized(page);
    const before = Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''));
    const target = await choose3d(page, !!isMobile);
    await expect(page.locator('.battlefield-selection')).toContainText('を選択中');
    await tap(page, target, !!isMobile);
    await expect(page.locator('.battlefield-selection')).toContainText(target + 'へ移動予定');
    expect(Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before);
    await tap(page, target, !!isMobile);
    await expect.poll(async () => Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before + 2);
    await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
    await page.waitForTimeout(350);
    await synchronized(page);
    await choose3d(page, !!isMobile);
    await page.getByRole('button', { name: '選択を解除' }).click();
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1400) {
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
      expect((await canvas.boundingBox())!.width).toBeGreaterThanOrEqual(520);
      await expect(page.getByRole('complementary', { name: '基本ルール' })).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath('persistent-' + width + '.png'), fullPage: true });
    await move3d(page, !!isMobile);
    await expect.poll(async () => Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before + 4);
    await noBoardEver(page);
    await page.reload();
    await page.getByRole('button', { name: /続きから/ }).click();
    await expect(canvas).toBeVisible();
    await synchronized(page);
    expect(Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBe(before + 4);
    expect(errors).toEqual([]);
    await noBoardEver(page);
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
  await expect(page.getByRole('list', { name: '三次元表示中の駒' })).toContainText('HQ-P2 自軍 飛行機');
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
  await expect(page.locator('.battlefield-selection')).toHaveText('青＝自軍 / 赤＝敵軍');
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
  await fallbackSetup(page);
  await expect(page.getByRole('alert')).toContainText('二次元盤面で続けられます');
  await move2d(page);
});
test('failed lazy download leaves 2D play available', async ({ page }) => {
  await page.route('**/src/battlefield3d/renderer.ts*', route => route.abort());
  await fallbackSetup(page);
  await expect(page.getByRole('alert')).toContainText('二次元盤面で続けられます');
  await move2d(page);
});

async function fallbackSetup(page: Page) {
  await page.goto(entry);
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  await expect(page.getByRole('alert')).toContainText('二次元盤面で続けられます');
  const before = await setupSaved(page);
  await page.getByRole('button', { name: /^B1 P1/ }).click();
  await page.getByRole('button', { name: /^E1 P1/ }).click();
  await expect(page.locator('.notice')).toContainText('入れ替え、ブラウザへ保存');
  expect((await setupSaved(page)).pieces).not.toEqual(before.pieces);
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
}

test('3D setup presets, drag and zoom never change placement; top-down picking still swaps', async ({ page, isMobile }, info) => {
  await trackBoard(page);
  await page.goto(entry);
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  const canvas = page.getByRole('img', { name: canvasName });
  await expect(canvas).toBeVisible();
  const saved = await setupSaved(page);
  await expect(page.getByRole('button', { name: '選択中の駒', exact: true })).toBeDisabled();
  await tap(page, 'B1', !!isMobile);
  await page.getByRole('button', { name: '選択中の駒', exact: true }).click();
  await page.screenshot({ path: info.outputPath('setup-selected.png') });
  await page.getByRole('button', { name: '自軍正面', exact: true }).click();
  await page.screenshot({ path: info.outputPath('setup-front.png') });
  await page.getByRole('button', { name: '選択を解除', exact: true }).click();
  await page.getByRole('button', { name: '全景', exact: true }).click();
  const position = await point(page, 'B1');
  await page.mouse.move(position.x, position.y); await page.mouse.down();
  await page.mouse.move(position.x + 70, position.y + 25, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.selection-panel')).toHaveCount(0);
  await canvas.scrollIntoViewIfNeeded();
  const beforeZoom = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(100);
  expect((await canvas.screenshot()).equals(beforeZoom)).toBe(false);
  await expect(page.locator('.selection-panel')).toHaveCount(0);
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 50, y: y + 15, id: 1 }, { x: x + 50, y: y - 15, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.selection-panel')).toHaveCount(0);
  expect(await setupSaved(page)).toEqual(saved);
  await page.getByRole('button', { name: '真上', exact: true }).click();
  for (const site of ['B1', 'E1'] as const) {
    const location = await point(page, site, .31, 'top');
    if (isMobile) await page.touchscreen.tap(location.x, location.y); else await page.mouse.click(location.x, location.y);
  }
  await expect(page.locator('.notice')).toContainText('入れ替え、ブラウザへ保存');
  expect((await setupSaved(page)).pieces).not.toEqual(saved.pieces);
  await noBoardEver(page);
});

test('3D setup all eight formations save without seed changes and forbidden flag exchange is rejected', async ({ page, isMobile }) => {
  await trackBoard(page);
  await page.goto(entry);
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^ふつう/ }).click();
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  const original = await setupSaved(page);
  const select = page.getByRole('combobox', { name: '陣形を変更' });
  const ids = await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
  expect(ids).toHaveLength(8);
  for (const id of ids) {
    await select.selectOption(id);
    await expect(page.locator('.notice')).toContainText('陣形を変更し、ブラウザへ保存');
    const saved = await setupSaved(page);
    expect(saved.cpuSeed).toBe(original.cpuSeed); expect(saved.difficulty).toBe('normal');
    const expected = saved.pieces.map((piece: { position: Site }) => piece.position).sort();
    const displayed = await page.getByRole('list', { name: '三次元表示中の駒' }).locator('li').allTextContents();
    expect(displayed.map(line => line.split(' ')[0]).sort()).toEqual(expected);
    expect(displayed.every(line => line.includes('自軍'))).toBe(true);
  }
  const saved = await setupSaved(page);
  const flag = saved.pieces.find((piece: { type: string }) => piece.type === 'flag');
  await tap(page, flag.position, !!isMobile); await tap(page, 'B4', !!isMobile);
  await expect(page.locator('.notice')).toContainText('地雷・軍旗は自軍の突破口入口');
  expect(await setupSaved(page)).toEqual(saved);
  await page.getByRole('button', { name: '選択を解除', exact: true }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  await noBoardEver(page);
});

test('setup context loss switches to emergency Board and the edited match still starts', async ({ page }) => {
  await page.goto(entry);
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  const canvas = page.getByRole('img', { name: canvasName });
  await expect(canvas).toBeVisible();
  await expect(page.locator('.board')).toHaveCount(0);
  await canvas.evaluate(element => (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByRole('alert')).toContainText('二次元盤面で続けられます');
  await page.getByRole('button', { name: /^B1 P1/ }).click();
  await page.getByRole('button', { name: /^E1 P1/ }).click();
  await expect(page.locator('.notice')).toContainText('入れ替え、ブラウザへ保存');
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  await expect(page.locator('.board')).toHaveCount(0);
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

test('3D high flight crosses the enemy and terminal position reveals labels', async ({ page, isMobile }) => {
  await page.goto(entry);
  await page.getByText('開発用・将来の機能').click();
  await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await page.getByText('検証用の盤面を開く', { exact: true }).click();
  await page.getByRole('button', { name: '飛行機の高飛び' }).click();
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  await tap(page, 'D5', !!isMobile); await tap(page, 'HQ-P2', !!isMobile);
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('list', { name: '三次元表示中の駒' })).toContainText('HQ-P2 自軍 飛行機');
  await expect(page.getByRole('list', { name: '三次元表示中の駒' })).toContainText('D7 敵軍 不明');
  await page.getByRole('button', { name: '司令部占領', exact: true }).click();
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  await tap(page, 'C7', !!isMobile); await tap(page, 'HQ-P2', !!isMobile); await tap(page, 'HQ-P2', !!isMobile);
  await expect(page.getByRole('heading', { name: '対局終了' })).toBeVisible();
  await expect(page.locator('.result')).toContainText('敵司令部を占領');
  await expect(page.getByRole('list', { name: '三次元表示中の駒' })).toContainText('A7 敵軍 大佐');
  await expect(page.locator('.board')).toHaveCount(0);
  await page.getByText('対局履歴（', { exact: false }).click();
  await expect(page.locator('.history')).toContainText('終局');
});

test('BGM is lazy, plays only on gesture, stops, and restores volume without autoplay', async ({ page }) => {
  const musicRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('shenyang.mp3')) musicRequests.push(request.url()); });
  await page.goto(entry);
  expect(musicRequests).toHaveLength(0);
  await expect(page.locator('audio')).not.toHaveAttribute('src');
  await page.getByRole('slider', { name: 'BGM音量' }).fill('40');
  await page.getByRole('button', { name: 'BGM ONにする' }).click();
  await expect(page.getByRole('button', { name: 'BGM OFFにする' })).toBeVisible();
  await expect.poll(() => page.locator('audio').evaluate((e: HTMLAudioElement) => e.currentTime)).toBeGreaterThan(0);
  expect(await page.locator('audio').evaluate((e: HTMLAudioElement) => e.volume)).toBe(.4);
  expect(musicRequests.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'BGM 再生' })).toBeVisible();
  expect(await page.locator('audio').evaluate((e: HTMLAudioElement) => e.paused)).toBe(true);
  await expect(page.getByRole('slider')).toHaveValue('40');
  await page.getByRole('button', { name: 'BGM 再生' }).click();
  await page.getByRole('button', { name: 'BGM OFFにする' }).click();
  expect(await page.locator('audio').evaluate((e: HTMLAudioElement) => e.paused)).toBe(true);
});

test('3D CPU match encrypted export and import restores the same position', async ({ page, isMobile }) => {
  await start(page); await page.waitForTimeout(350); await move3d(page, !!isMobile);
  const before = await page.getByRole('list', { name: '三次元表示中の駒' }).textContent();
  await page.getByRole('button', { name: '対局を保存', exact: true }).click();
  await page.getByLabel('パスワード', { exact: true }).fill('Test-only-roundtrip-12');
  await page.getByLabel('パスワード（確認）').fill('Test-only-roundtrip-12');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルを保存', exact: true }).click();
  const file = await download;
  const backup = { name: file.suggestedFilename(), mimeType: "application/json", buffer: await readFile((await file.path())!) };
  await page.goto(entry);
  await page.getByRole('button', { name: '保存した対局を読み込む' }).click();
  await page.getByLabel('対局ファイル').setInputFiles(backup);
  await page.getByLabel('パスワード', { exact: true }).fill('Test-only-roundtrip-12');
  await page.getByRole('button', { name: '対局を読み込む', exact: true }).click();
  await page.getByRole('button', { name: '読み込んだ対局へ置き換える' }).click();
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  await expect(page.getByRole('list', { name: '三次元表示中の駒' })).toHaveText(before!);
  await expect(page.locator('.board')).toHaveCount(0);
});
