import { expect, test, type Page } from '@playwright/test';
import { applyMove, startGame } from '../src/game/game';
import { PIECES } from '../src/game/pieces';
import { defaultPlacement } from '../src/dev/fixtures';
import { chooseCpuMove } from '../src/cpu/strategy';
import { observeForCpu } from '../src/cpu/observation';
import { advanceSavedMatch, createSavedMatch, MATCH_STORAGE_KEY } from '../src/save/match';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
const entry = process.env.BATTLEFIELD_TEST_URL ?? '/';
const canvasName = '操作可能な三次元戦場';
function terminalMatch() {
  let game = startGame(defaultPlacement(1), defaultPlacement(2), 1);
  let match = createSavedMatch(game, 'normal', 9750);
  for (let i = 0; i < 1000 && !game.result; i++) {
    game = applyMove(game, chooseCpuMove(observeForCpu(game, game.turn!), 'normal', 9750 + i)!);
    match = advanceSavedMatch(match, game);
  }
  if (!game.result) throw new Error('Fixture did not finish through official rules');
  return match;
}
const match = terminalMatch();
const firstBattle = match.game.events.find(e => e.kind === 'MOVE' && e.battle);
if (!firstBattle || firstBattle.kind !== 'MOVE') throw new Error('No battle fixture');
const battleIndex = firstBattle.moveNumber;

async function prepare(page: Page) {
  await page.addInitScript(({ key, saved }) => {
    localStorage.setItem(key, saved);
    Object.assign(window, { normalBoardMounted: false });
    new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches('.board') || node.querySelector('.board'))))) Object.assign(window, { normalBoardMounted: true });
    }).observe(document, { childList: true, subtree: true });
  }, { key: MATCH_STORAGE_KEY, saved: JSON.stringify(match) });
  await page.goto(entry);
  await page.getByRole('button', { name: /続きから/ }).click();
  await expect(page.getByRole('heading', { name: '対局終了' })).toBeVisible();
}
async function seek(page: Page, index: number) {
  const slider = page.getByRole('slider', { name: '再現手数' });
  await slider.fill(String(index));
  await expect(page.getByRole('status', { name: '再現中の手' })).toContainText(`第${index}手`);
}

for (const [width, height] of [[1920,1080], [1440,900], [1280,720], [430,932], [390,844]]) {
  test(`chronicle, battle and sound ${width}x${height}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.addInitScript(() => {
      const contexts: AudioContext[] = [];
      let tones = 0;
      const Native = window.AudioContext;
      const original = Native.prototype.createOscillator;
      Native.prototype.createOscillator = function () { tones++; return original.call(this); };
      window.AudioContext = new Proxy(Native, { construct(target, args) { const context = Reflect.construct(target, args) as AudioContext; contexts.push(context); return context; } });
      Object.assign(window, { soundProbe: () => ({ contexts: contexts.length, state: contexts.at(-1)?.state, tones }) });
    });
    await page.setViewportSize({ width, height });
    await prepare(page);
    const saved = await page.evaluate(key => localStorage.getItem(key), MATCH_STORAGE_KEY);
    const probe = () => page.evaluate(() => (window as unknown as { soundProbe(): { contexts:number;state?:string;tones:number } }).soundProbe());
    expect((await probe()).contexts).toBe(0);
    await page.getByRole('button', { name: '効果音 ONにする' }).click();
    await expect(page.getByRole('button', { name: '効果音 OFFにする' })).toHaveAttribute('aria-pressed', 'true');
    expect(await probe()).toMatchObject({ contexts: 1, state: 'running' });
    expect((await probe()).tones).toBeGreaterThan(0);
    await page.getByRole('button', { name: '効果音 OFFにする' }).click();
    expect((await probe()).state).toBe('suspended');
    await page.screenshot({ path: info.outputPath(`ended-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '戦史再現', exact: true }).click();
    const canvas = page.getByRole('img', { name: canvasName });
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('list', { name: '三次元表示中の駒' }).locator('li')).toHaveCount(46);
    await expect(page.getByRole('list', { name: '三次元表示中の駒' })).not.toContainText('不明');
    await page.getByRole('button', { name: '次の手', exact: true }).click();
    await expect(page.getByRole('status', { name: '再現中の手' })).toContainText('第1手');
    await page.getByRole('button', { name: '前の手', exact: true }).click();
    await expect(page.getByRole('status', { name: '再現中の手' })).toContainText('初期配置');
    for (const speed of ['0.5', '1', '2']) {
      await page.getByRole('combobox', { name: '再現速度' }).selectOption(speed);
      await expect(page.getByRole('combobox', { name: '再現速度' })).toHaveValue(speed);
    }
    await page.getByRole('button', { name: '再生', exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole('slider', { name: '再現手数' }).inputValue())).toBeGreaterThan(0);
    await page.getByRole('button', { name: '一時停止', exact: true }).click();
    const paused = await page.getByRole('slider', { name: '再現手数' }).inputValue();
    await page.waitForTimeout(550);
    expect(await page.getByRole('slider', { name: '再現手数' }).inputValue()).toBe(paused);
    await seek(page, battleIndex - 1);
    await page.getByRole('button', { name: '全景', exact: true }).click();
    await page.getByRole('button', { name: '次の手', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-battle-effect', /ATTACKER|DEFENDER|MUTUAL/);
    await expect(canvas).toHaveAttribute('data-camera-director', 'manual');
    await page.screenshot({ path: info.outputPath(`battle-${width}.png`), fullPage: true });
    await expect(canvas).not.toHaveAttribute('data-battle-effect', /./);
    await seek(page, 12);
    await page.screenshot({ path: info.outputPath(`chronicle-${width}.png`), fullPage: true });
    await seek(page, match.game.moveCount);
    const expected = match.game.pieces.filter(p => p.position).map(p => `${p.position} ${p.owner === 1 ? '自軍' : '敵軍'} ${PIECES[p.type].label}`).sort();
    const actual = await page.getByRole('list', { name: '三次元表示中の駒' }).locator('li').allTextContents();
    expect(actual.sort()).toEqual(expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '結果画面へ戻る', exact: true }).click();
    await expect(page.getByRole('heading', { name: '対局終了' })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), MATCH_STORAGE_KEY)).toBe(saved);
    expect(await page.evaluate(() => (window as unknown as { normalBoardMounted:boolean }).normalBoardMounted)).toBe(false);
    await expect(page.locator('.board')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('battle focus restores the camera and seek cancels effects; idle frames stop', async ({ page }, info) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const native = window.requestAnimationFrame;
    Object.assign(window, { framesObserved: 0 });
    window.requestAnimationFrame = callback => native(time => { const win = window as unknown as { framesObserved:number }; win.framesObserved++; callback(time); });
  });
  await prepare(page);
  await page.getByRole('button', { name: '戦史再現', exact: true }).click();
  const canvas = page.getByRole('img', { name: canvasName });
  await expect(canvas).toBeVisible();
  const currentTime = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(currentTime + 60_000));
  await seek(page, battleIndex - 1);
  await page.clock.runFor(350);
  await page.getByRole('button', { name: '次の手', exact: true }).click();
  await page.clock.runFor(260);
  await expect(canvas).toHaveAttribute('data-camera-director', 'focus');
  await expect(canvas).toHaveAttribute('data-battle-effect', /./);
  await page.screenshot({ path: info.outputPath('focused-battle.png') });
  await seek(page, 0);
  await page.clock.runFor(1100);
  await expect(canvas).not.toHaveAttribute('data-battle-effect', /./);
  const frames = await page.evaluate(() => (window as unknown as { framesObserved:number }).framesObserved);
  await page.clock.runFor(250);
  expect(await page.evaluate(() => (window as unknown as { framesObserved:number }).framesObserved)).toBe(frames);
});

test('reduced motion disables cinematic movement and particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page);
  await page.getByRole('button', { name: '戦史再現', exact: true }).click();
  const canvas = page.getByRole('img', { name: canvasName });
  await expect(canvas).toBeVisible();
  await seek(page, battleIndex - 1);
  await page.getByRole('button', { name: '次の手', exact: true }).click();
  await expect(page.getByRole('status', { name: '再現中の手' })).toContainText('戦闘');
  await expect(canvas).not.toHaveAttribute('data-battle-effect', /./);
});

for (const failure of ['absent', 'device']) {
  test(`WebGPU ${failure} safely falls back to the established WebGL2 battlefield`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(kind => {
      const gpu = kind === 'absent' ? undefined : { requestAdapter: async () => ({ features: new Set(), limits: {}, requestDevice: async () => { throw new Error('Unavailable test device'); } }) };
      Object.defineProperty(navigator, 'gpu', { value: gpu, configurable: true });
    }, failure);
    await prepare(page);
    const canvas = page.getByRole('img', { name: canvasName });
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('data-backend', 'webgl2');
    await expect(page.locator('.board')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const firstPlayer of [1, 2] as const) {
  test(`emergency Board confirmation stays clickable with first player ${firstPlayer}`, async ({ page }) => {
    const active = createSavedMatch(startGame(defaultPlacement(1), defaultPlacement(2), firstPlayer), 'normal', 9750);
    await page.addInitScript(({ key, value }) => {
      localStorage.setItem(key, value);
      Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        return kind === 'webgl2' ? null : Reflect.apply(original, this, [kind, ...args]);
      } as typeof original;
    }, { key: MATCH_STORAGE_KEY, value: JSON.stringify(active) });
    await page.setViewportSize({ width: 2048, height: 1000 });
    await page.goto(entry);
    await page.getByRole('button', { name: /続きから/ }).click();
    await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
    const own = page.locator('.board .cell.side-1');
    await expect(own.first()).toBeVisible();
    for (let i = 0; i < await own.count(); i++) {
      await own.nth(i).click();
      if (await page.locator('.board .cell.legal').count()) break;
    }
    await page.locator('.board .cell.legal').first().click();
    const button = page.getByRole('button', { name: '確定して実行' });
    await expect(button).toBeEnabled();
    const bounds = (await button.boundingBox())!;
    const history = (await page.getByText(/対局履歴（/, { exact: false }).first().boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(history.y);
    await button.click();
    await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), MATCH_STORAGE_KEY);
    expect(stored.game.moveCount).toBeGreaterThan(firstPlayer === 1 ? 0 : 1);
  });
}
