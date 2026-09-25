import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

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
    expect(cells.every(c => c.w >= 40 && c.h >= 44)).toBe(true);
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
  const opponentCount = await opponent.count();
  expect(opponentCount).toBeGreaterThanOrEqual(22); // CPU may have moved and fought when chosen to play first.
  expect(opponentCount).toBeLessThanOrEqual(23);
  expect(await opponent.locator('.piece-label').allTextContents()).toEqual(Array(opponentCount).fill('？'));
  expect(await opponent.locator('.piece-face').count()).toBe(0);
  expect(await page.locator('.cell.side-1 .piece-face').count()).toBeGreaterThan(0);
  const own = page.locator('.cell.side-1');
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
