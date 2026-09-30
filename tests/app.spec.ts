import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Retain the complete legacy journeys as explicit non-WebGL fallback coverage.
// Normal three-dimensional journeys live in battlefield.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      return kind === 'webgl2' ? null : Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
});
test('wide play screen centers the board and keeps the shared rule panels beside it', async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1000 });
  await page.goto('/');
  await page.getByText('開発用・将来の機能').click();
  await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await page.getByText('検証用の盤面を開く', { exact: true }).click();
  await page.getByRole('button', { name: '飛行機の高飛び' }).click();
  const geometry = await page.evaluate(() => {
    const board = document.querySelector('.game-surfaces')!.getBoundingClientRect();
    const panels = [...document.querySelectorAll<HTMLElement>('.rule-reference')].filter(panel => getComputedStyle(panel).display !== 'none');
    return { centerDelta: Math.abs(board.x + board.width / 2 - innerWidth / 2), pageHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, panelCount: panels.length, panelsFit: panels.every(panel => panel.scrollHeight <= panel.clientHeight + 2) };
  });
  expect(geometry.centerDelta).toBeLessThanOrEqual(8);
  expect(geometry.pageHeight).toBeGreaterThanOrEqual(geometry.viewportHeight);
  await expect(page.getByRole('region',{name:'軍議操作'})).toBeVisible();
  expect(geometry.panelCount).toBe(2);
  expect(geometry.panelsFit).toBe(true);
  await page.getByRole('button', { name: 'D5 P1 飛行機' }).click();
  await page.getByRole('button', { name: 'HQ-P2 P2 工兵' }).click();
  await expect(page.getByRole('button', { name: '確定して実行' })).toBeEnabled();
  const confirmation = await page.evaluate(() => ({ pageAccessible: document.documentElement.scrollWidth <= innerWidth, panelsFit: [...document.querySelectorAll<HTMLElement>('.rule-reference')].every(panel => panel.scrollHeight <= panel.clientHeight + 2), confirmFits: document.querySelector('.confirm .primary')!.getBoundingClientRect().height >= 44 }));
  expect(confirmation.pageAccessible).toBe(true);
  expect(confirmation.panelsFit).toBe(true);
  expect(confirmation.confirmFits).toBe(true);
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '基本ルール' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '駒の強弱早見' })).toBeVisible();
  const result = await page.evaluate(() => ({ pageAccessible: document.documentElement.scrollWidth <= innerWidth, panelsFit: [...document.querySelectorAll<HTMLElement>('.rule-reference')].every(panel => panel.scrollHeight <= panel.clientHeight + 2) }));
  expect(result.pageAccessible).toBe(true);
  expect(result.panelsFit).toBe(true);
});

test('three-column command layout preserves board size and accessible controls at ten viewports', async ({ page }) => {
  const sizes = [[2048, 1000], [1920, 900], [1600, 900], [1440, 900], [1280, 720], [1024, 768], [932, 430], [844, 390], [430, 932], [390, 844]] as const;
  const measurements: { state: string; size: string; [key: string]: unknown }[] = [];
  await page.goto('/');
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();

  async function inspect(state: 'setup' | 'play') {
    await expect(page.locator('.board')).toBeVisible();
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      const result = await page.evaluate(({ width, height, state }) => {
        const box = (element: Element | null) => {
          if (!element) return null;
          const r = element.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) };
        };
        const board = document.querySelector('.board')!;
        const boardRect = board.getBoundingClientRect();
        const references = [...document.querySelectorAll<HTMLElement>('.rule-reference')];
        const visibleReferences = references.filter(element => getComputedStyle(element).display !== 'none');
        const referenceBoxes = visibleReferences.map(element => ({ label: element.getAttribute('aria-label'), box: box(element), overflow: element.scrollHeight - element.clientHeight }));
        const overlapsBoard = visibleReferences.some(element => {
          const r = element.getBoundingClientRect();
          return boardRect.right > r.left && boardRect.left < r.right && boardRect.bottom > r.top && r.bottom > boardRect.top;
        });
        const savedVisibility = references.map(element => element.style.visibility);
        references.forEach(element => { element.style.visibility = 'hidden'; });
        const baseline = box(board);
        references.forEach((element, index) => { element.style.visibility = savedVisibility[index]; });
        const control = state === 'setup' ? document.querySelector('.setup-screen .wide') : document.querySelector('.move-prompt') ?? document.querySelector('.confirm .primary');
        const wideMode = width >= 1200 && height >= 800;
        return {
          board: box(board), baseline, boardCenterDelta: Math.round((state === 'play' ? document.querySelector('.game-surfaces')!.getBoundingClientRect().x + document.querySelector('.game-surfaces')!.getBoundingClientRect().width / 2 : boardRect.x + boardRect.width / 2) - innerWidth / 2),
          references: referenceBoxes, referenceCount: visibleReferences.length, overlapsBoard,
          horizontalScroll: document.documentElement.scrollWidth > innerWidth,
          documentAccessible: document.documentElement.scrollWidth <= innerWidth,
          control: box(control), controlVisible: !!control && getComputedStyle(control).display !== 'none', wideMode,
          referenceExpected: width >= 1400 && height >= 850,
        };
      }, { width, height, state });
      measurements.push({ state, size: `${width}x${height}`, ...result });
      expect(result.horizontalScroll, `${state} ${width}x${height} horizontal scroll`).toBe(false);
      expect(Math.abs(result.boardCenterDelta), `${state} ${width}x${height} board center`).toBeLessThanOrEqual(4);
      expect(result.referenceCount, `${state} ${width}x${height} rule columns`).toBe(result.referenceExpected ? 2 : 0);
      expect(result.overlapsBoard).toBe(false);
      expect((result.board as { width: number }).width).toBe((result.baseline as { width: number }).width);
      expect((result.board as { height: number }).height).toBe((result.baseline as { height: number }).height);
      expect(result.controlVisible).toBe(true);
      if (result.wideMode) {
        expect(result.documentAccessible, `${state} ${width}x${height} page fits`).toBe(true);
        expect((result.control as { y: number }).y).toBeGreaterThanOrEqual(0);
        expect((result.control as { height: number }).height).toBeGreaterThanOrEqual(state==='setup'?44:24);
        const targets=await page.getByRole('region',{name:'軍議操作'}).locator('button:visible').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().height));
        expect(targets.every(h=>h>=44)).toBe(true);
        await expect(page.getByRole('region',{name:'軍議操作'})).toBeVisible();
        expect(result.references.every(reference => reference.overflow <= 2)).toBe(true);
      }
      await expect(page.locator('.board .cell').first()).toBeVisible();
    }
  }

  await inspect('setup');
  await page.setViewportSize({ width: 2048, height: 1000 });
  const setupPieces = page.locator('.board .cell.side-1');
  let placementFound = false;
  for (let index = 0; index < await setupPieces.count(); index++) {
    await setupPieces.nth(index).click();
    if (await page.locator('.board .cell.legal').count()) { placementFound = true; break; }
  }
  expect(placementFound).toBe(true);
  await page.locator('.board .cell.legal').first().click();
  await expect(page.locator('.setup-screen .notice')).toContainText('入れ替え');
  const setupConfirmation = await page.evaluate(() => ({ pageAccessible: document.documentElement.scrollWidth <= innerWidth, confirmFits: document.querySelector('.setup-screen .wide')!.getBoundingClientRect().height >= 44 }));
  expect(setupConfirmation.pageAccessible).toBe(true);
  expect(setupConfirmation.confirmFits).toBe(true);
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  await inspect('play');
  await test.info().attach('three-column-layout.json', { body: Buffer.from(JSON.stringify(measurements, null, 2)), contentType: 'application/json' });

  await page.setViewportSize({ width: 2048, height: 1000 });
  const own = page.locator('.board .cell.side-1');
  await expect(own.first()).toBeVisible();
  let found = false;
  for (let index = 0; index < await own.count(); index++) {
    await own.nth(index).click();
    if (await page.locator('.board .cell.legal').count()) { found = true; break; }
  }
  expect(found).toBe(true);
  await page.locator('.board .cell.legal').first().click();
  await expect(page.getByRole('button', { name: '確定して実行' })).toBeVisible();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('complementary', { name: '基本ルール' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '駒の強弱早見' })).toBeVisible();
  const afterCpuReply = await page.evaluate(() => ({ pageAccessible: document.documentElement.scrollWidth <= innerWidth, panelsFit: [...document.querySelectorAll<HTMLElement>('.rule-reference')].every(panel => panel.scrollHeight <= panel.clientHeight + 2) }));
  expect(afterCpuReply.pageAccessible).toBe(true);
  expect(afterCpuReply.panelsFit).toBe(true);
});

test('setup → confirmed move, narrow layout, and rules link', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('見えない陣形');
  await expect(page.getByRole('link', { name: /正式ゲームルール/ })).toHaveAttribute('href', /docs\/GAME_RULES.md$/);
  await page.getByText('開発用・将来の機能').click(); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await page.getByRole('combobox', { name: '配置する側' }).selectOption('2');
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'P1の手番' })).toBeVisible();
  await page.locator('[data-site="B4"]').click();
  await page.locator('[data-site="B5"]').click();
  await expect(page.getByRole('button', { name: '確定して実行' })).toBeVisible();
  await expect(page.getByText('0手', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByText('1手', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /軍人将棋/ }).click();
  await page.getByText('開発用・将来の機能').click(); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await expect(page.getByText('1手', { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const cells = await page.locator('.cell').evaluateAll(els => els.map(e => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
    expect(cells.every(c => c.w >= 40 && c.h >= 44), `${width}px cells: ${JSON.stringify(cells.slice(0, 8))}`).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('HQ lanes remain canonical when rotated and result visible', async ({ page }) => {
  await page.goto('/'); await page.getByText('開発用・将来の機能').click(); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await page.getByText('検証用の盤面を開く', { exact: true }).click();
  await page.getByRole('button', { name: '飛行機のC/D経路' }).click();
  await page.getByRole('combobox', { name: '盤面の向き' }).selectOption('2');
  await page.getByRole('button', { name: 'HQ-P1 P1 飛行機' }).click();
  await page.getByRole('button', { name: 'HQ-P2 P2 工兵' }).click();
  await expect(page.getByRole('button', { name: '確定して実行' })).toBeDisabled();
  await page.getByRole('radio', { name: 'C列を通る' }).check();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeVisible();
  await expect(page.locator('.latest-event')).toContainText('（C列）：攻撃側勝利');
  await page.getByRole('button', { name: '司令部占領', exact: true }).click();
  await page.getByRole('button', { name: 'C7 P1 大将' }).click();
  await page.getByRole('button', { name: 'HQ-P2 空き' }).click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByText('P1の勝利', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('result.png'), fullPage: true });
});
test('D5 aircraft high flight shows HQ legal over D7 enemy and battles only on landing', async ({ page }) => {
  await page.goto('/');
  await page.getByText('開発用・将来の機能').click();
  await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await page.getByText('検証用の盤面を開く', { exact: true }).click();
  await page.getByRole('button', { name: '飛行機の高飛び' }).click();
  await page.getByRole('button', { name: 'D5 P1 飛行機' }).click();
  await expect(page.getByRole('button', { name: 'HQ-P2 P2 工兵' })).toHaveClass(/legal/);
  await page.getByRole('button', { name: 'HQ-P2 P2 工兵' }).click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('button', { name: 'D7 P2 スパイ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeVisible();
  await expect(page.locator('.latest-event')).toContainText('HQ-P2：攻撃側勝利');
  await expect(page.getByRole('heading', { name: 'P2の手番' })).toBeVisible();
});
test('configuration autosave survives reload but READY is not persisted', async ({ page }) => {
  await page.goto('/'); await page.getByText('開発用・将来の機能').click(); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  const before = await page.locator('[data-site="B1"]').getAttribute('aria-label');
  await page.locator('[data-site="B1"]').click(); await page.locator('[data-site="E1"]').click();
  const after = await page.locator('[data-site="B1"]').getAttribute('aria-label'); expect(after).not.toBe(before);
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await page.reload(); await page.getByText('開発用・将来の機能').click(); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await expect(page.locator('[data-site="B1"]')).toHaveAttribute('aria-label', after!);
  await expect(page.getByRole('button', { name: 'この配置で確定' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('setup.png'), fullPage: true });
});

for (const difficulty of ['かんたん', 'ふつう'] as const) test(`CPU ${difficulty}: setup, hidden pieces, human move, CPU reply`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: new RegExp(`^${difficulty}`) }).click();
  await expect(page.getByRole('heading', { name: 'あなたの陣形' })).toBeVisible();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible({ timeout: 10000 });
  const opponent = page.locator('.cell.side-2');
  await expect(opponent.first()).toBeVisible();
  const opponentCount = await opponent.count();
  expect(opponentCount).toBeGreaterThanOrEqual(22); // CPU may have moved and fought when chosen to play first.
  expect(opponentCount).toBeLessThanOrEqual(23);
  for (const cell of await opponent.all()) {
    const site=await cell.getAttribute('data-site');
    await expect(cell.locator('.piece-label')).toHaveText(site?.startsWith('HQ')?'敵駒':'？');
  }
  expect(await opponent.locator('.piece-face').count()).toBe(0);
  expect(await page.locator('.cell.side-1 .piece-face').count()).toBeGreaterThan(0);
  const own = page.locator('.cell.side-1');
  await expect(own.first()).toBeVisible();
  let selected = false;
  for (let i = 0; i < await own.count(); i++) {
    await own.nth(i).click();
    if (await page.locator('.cell.legal').count() > 0) { selected = true; break; }
  }
  expect(selected).toBe(true);
  await page.locator('.cell.legal').first().click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect.poll(async () => Number((await page.locator('.badge').first().textContent())?.replace(/\D/g, '') ?? 0), { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (difficulty === 'かんたん') await page.screenshot({ path: test.info().outputPath('cpu-match.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('CPU formation can be edited and a second destination click confirms on mobile and desktop', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  const setup = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-setup:v1')!));
  expect(setup.pieces).toHaveLength(23);
  expect(new Set(setup.pieces.map((piece: { position: string }) => piece.position)).size).toBe(23);
  await page.locator('[data-site="B1"]').click(); await page.locator('[data-site="E1"]').click();
  const edited = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-setup:v1')!));
  expect(edited.pieces).not.toEqual(setup.pieces);
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible({ timeout: 10000 });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!).game.moveCount as number);
  const own = page.locator('.board .cell.side-1');
  await expect(own.first()).toBeVisible();
  let found = false;
  for (let i = 0; i < await own.count(); i++) {
    await own.nth(i).click();
    if (await page.locator('.board .cell.legal:not(.hq)').count()) { found = true; break; }
  }
  expect(found).toBe(true);
  await page.locator('.board .cell.legal:not(.hq)').first().click();
  await expect(page.locator('.board .cell.pending')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '確定して実行' })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!).game.moveCount)).toBe(before);
  await page.locator('.board .cell.pending').click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!).game.moveCount), { timeout: 10000 }).toBeGreaterThan(before);
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible({ timeout: 10000 });
});

test('CPU match auto-saves and resumes after reload and later moves', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '続きから' })).toBeDisabled();
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!));
  expect(before.game.pieces).toHaveLength(46);
  expect(before.initialPlacements.p1).toHaveLength(23);
  expect(before.initialPlacements.p2).toHaveLength(23);
  await page.reload();
  await expect(page.getByRole('button', { name: '続きから' })).toBeEnabled();
  await page.getByRole('button', { name: '続きから' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  const own = page.locator('.cell.side-1');
  await expect(own.first()).toBeVisible();
  for (let i = 0; i < await own.count(); i++) {
    await own.nth(i).click();
    if (await page.locator('.cell.legal').count() > 0) break;
  }
  await page.locator('.cell.legal').first().click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!))).game.moveCount).toBeGreaterThan(before.game.moveCount);
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!));
  expect(after.stateVersion).toBeGreaterThan(before.stateVersion);
  expect(after.game.events.filter((event: { kind: string; actor?: number }) => event.kind === 'MOVE' && event.actor === 2).length).toBeGreaterThan(before.game.events.filter((event: { kind: string; actor?: number }) => event.kind === 'MOVE' && event.actor === 2).length);
  await page.reload(); await page.getByRole('button', { name: '続きから' }).click();
  await expect(page.locator('.badge').first()).toContainText(String(after.game.moveCount));
});

test('a v0.1 browser match resumes under v0.2 after replay validation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible({ timeout: 10000 });
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!));
  await page.evaluate(() => {
    const key = 'military-chess:cpu-match:v1';
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.rulesetVersion = 'v0.1';
    saved.game.rulesetVersion = 'v0.1';
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '続きから' })).toBeEnabled();
  await page.getByRole('button', { name: '続きから' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible({ timeout: 10000 });
  const own = page.locator('.board .cell.side-1');
  await expect(own.first()).toBeVisible();
  for (let i = 0; i < await own.count(); i++) {
    await own.nth(i).click();
    if (await page.locator('.board .cell.legal:not(.hq)').count()) break;
  }
  await page.locator('.board .cell.legal:not(.hq)').first().click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!).rulesetVersion)).toBe('v0.2');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!));
  expect(stored.localGameId).toBe(original.localGameId);
  expect(stored.initialPlacements).toEqual(original.initialPlacements);
  expect(stored.game.events.slice(0, original.game.events.length)).toEqual(original.game.events);
});

test('placement changes resume with selected difficulty and seed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^ふつう/ }).click();
  const before = await page.locator('[data-site="B1"]').getAttribute('aria-label');
  await page.locator('[data-site="B1"]').click(); await page.locator('[data-site="E1"]').click();
  const after = await page.locator('[data-site="B1"]').getAttribute('aria-label');
  expect(after).not.toBe(before);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-setup:v1')!));
  expect(draft.difficulty).toBe('normal');
  await page.reload();
  await expect(page.getByRole('button', { name: '続きから' })).toBeEnabled();
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await expect(page.getByRole('dialog', { name: '新しい対局の確認' })).toBeVisible();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await page.getByRole('button', { name: '続きから' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの陣形' })).toBeVisible();
  await expect(page.locator('[data-site="B1"]')).toHaveAttribute('aria-label', after!);
  await expect(page.getByText(/難易度：ふつう/)).toBeVisible();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  const match = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!));
  expect(match.localGameId).toBe(draft.localGameId);
  expect(match.cpuSeed).toBe(draft.cpuSeed);
  expect(await page.evaluate(() => localStorage.getItem('military-chess:cpu-setup:v1'))).toBeNull();
});

test('password file exports, rejects wrong password and tampering, then imports after confirmation', async ({ page }) => {
  const password = randomUUID();
  await page.goto('/');
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^ふつう/ }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!));
  await page.getByRole('button', { name: '対局を保存' }).click();
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (test.info().project.name === 'mobile') await page.screenshot({ path: test.info().outputPath('password-save.png'), fullPage: true });
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByLabel('パスワード（確認）').fill(password + '0');
  await page.getByRole('button', { name: 'ファイルを保存' }).click();
  await expect(page.getByRole('alert')).toContainText('一致しません');
  await page.getByLabel('パスワード（確認）').fill(password);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ファイルを保存' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.mcsave$/);
  const bytes = await readFile((await download.path())!);
  const content = bytes.toString('utf8');
  expect(content).not.toContain(password);
  expect(content).not.toContain('initialPlacements');
  const backup = { name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes };
  await page.getByRole('button', { name: 'タイトルへ' }).click();
  await page.getByRole('button', { name: '保存した対局を読み込む' }).click();
  await page.locator('input[type=file]').setInputFiles(backup);
  await page.getByLabel('パスワード', { exact: true }).fill(password + '0');
  await page.getByRole('button', { name: '対局を読み込む' }).click();
  await expect(page.getByRole('alert')).toContainText('パスワードが違うか');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!))).localGameId).toBe(before.localGameId);
  const altered = JSON.parse(content); altered.ciphertext = (altered.ciphertext[0] === 'A' ? 'B' : 'A') + altered.ciphertext.slice(1);
  await page.locator('input[type=file]').setInputFiles({ ...backup, buffer: Buffer.from(JSON.stringify(altered)) });
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: '対局を読み込む' }).click();
  await expect(page.getByRole('alert')).toContainText('破損・改ざん');
  await page.locator('input[type=file]').setInputFiles(backup);
  await page.getByRole('button', { name: '対局を読み込む' }).click();
  await expect(page.getByRole('dialog', { name: '読み込みの確認' })).toBeVisible();
  await page.getByRole('button', { name: '読み込んだ対局へ置き換える' }).click();
  await expect(page.getByRole('heading', { name: /あなたの手番|CPUの手番/ })).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!))).localGameId).toBe(before.localGameId);
});

test('corrupt autosave is rejected, while new game and overwrite confirmation remain available', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('military-chess:cpu-match:v1', '{broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('復元できません');
  await expect(page.getByRole('button', { name: '続きから' })).toBeDisabled();
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  await page.getByRole('button', { name: 'タイトルへ' }).click();
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await expect(page.getByRole('dialog', { name: '新しい対局の確認' })).toBeVisible();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByRole('button', { name: '続きから' })).toBeEnabled();
});

test('mobile-first journey, keyboard controls, and six responsive widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'コンピューターと対戦' })).toBeVisible();
  await expect(page.getByRole('button', { name: '続きから' })).toBeDisabled();
  await page.getByRole('button', { name: '遊び方' }).click();
  await expect(page.getByText('戦闘は自動で判定します。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'タイトルへ戻る' }).click();
  await page.getByRole('button', { name: 'コンピューターと対戦' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '難易度を選ぶ' })).toBeVisible();
  await expect(page.getByText(/初めて遊ぶ人向け/)).toBeVisible();
  await expect(page.getByText(/公開情報を使って/)).toBeVisible();
  await page.getByRole('button', { name: /^かんたん/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/配置完了。この配置で対局を始められます/)).toBeVisible();
  await page.getByText('自軍の駒一覧・枚数を見る').click();
  await expect(page.locator('.inventory-type')).toHaveCount(16);
  await page.locator('[data-site="B1"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-site="B1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-site="E1"]').focus(); await page.keyboard.press('Enter');
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `setup at ${width}px`).toBe(true);
    const sizes = await page.locator('.board .cell').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
    expect(Math.min(...sizes), `board cells at ${width}px`).toBeGreaterThanOrEqual(40);
    if (width === 320 || width === 390) {
      const clipped = await page.locator('.board .cell.side-1 .piece-name').evaluateAll(names => names.filter(name => {
        const piece = name.closest('.cell')!.getBoundingClientRect();
        const text = name.getBoundingClientRect();
        return text.left < piece.left || text.right > piece.right || name.scrollWidth > name.clientWidth + 1;
      }).length);
      expect(clipped, `piece names at ${width}px`).toBe(0);
    }
    if (width === 320 && test.info().project.name === 'mobile') await page.screenshot({ path: test.info().outputPath('cpu-setup-320.png'), fullPage: true });
    if (width === 390 && test.info().project.name === 'mobile') await page.screenshot({ path: test.info().outputPath('cpu-setup-390.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  const movesBefore = await page.locator('.badge').first().textContent();
  const own = page.locator('.board .cell.side-1');
  await expect(own.first()).toBeVisible();
  for (let index = 0; index < await own.count(); index++) {
    await own.nth(index).click();
    if (await page.locator('.board .cell.legal').count()) break;
  }
  await expect(page.locator('.board .cell.selected')).toHaveCount(1);
  await page.locator('.board .cell.legal').first().click();
  await expect(page.locator('.confirm')).toContainText(/から .* へ動かします/);
  await page.getByRole('button', { name: '選び直す' }).click();
  await expect(page.locator('.badge').first()).toHaveText(movesBefore!);
  await page.locator('.board .cell.legal').first().click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
  await expect(page.locator('.latest-event')).toContainText('コンピューター');
  await expect(page.locator('.board .cell.last-from')).toHaveCount(1);
  await page.getByRole('button', { name: '対局を保存' }).click();
  await expect(page.getByText(/8文字以上のパスワード/)).toBeVisible();
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `save at ${width}px`).toBe(true);
  }
  await page.getByRole('button', { name: '戻る' }).click();
  await page.getByRole('button', { name: 'タイトルへ' }).click();
  await page.getByRole('button', { name: '続きから' }).click();
  await expect(page.locator('.latest-event')).toContainText('コンピューター');
  await page.getByRole('button', { name: 'タイトルへ' }).click();
  await page.getByRole('button', { name: 'コンピューターと対戦' }).click();
  const dialog = page.getByRole('dialog', { name: '新しい対局の確認' });
  await expect(dialog).toBeFocused();
  await page.setViewportSize({ width: 320, height: 850 });
  expect(await dialog.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  if (test.info().project.name === 'mobile') await page.screenshot({ path: test.info().outputPath('replace-dialog-320.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
