import { expect, test } from '@playwright/test';

test('setup → confirmed move, narrow layout, and rules link', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('見えない陣形');
  await expect(page.getByRole('link', { name: /正式ゲームルール/ })).toHaveAttribute('href', /docs\/GAME_RULES.md$/);
  await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
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
  await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
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
  await page.goto('/'); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await page.getByText('検証用の盤面を開く', { exact: true }).click();
  await page.getByRole('button', { name: '飛行機のC/D経路' }).click();
  await page.getByRole('combobox', { name: '盤面の向き' }).selectOption('2');
  await page.getByRole('button', { name: 'HQ-P1 P1 飛行機' }).click();
  await page.getByRole('button', { name: 'HQ-P2 P2 工兵' }).click();
  await expect(page.getByRole('button', { name: '確定して実行' })).toBeDisabled();
  await page.getByRole('radio', { name: 'C列' }).check();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByRole('button', { name: 'HQ-P2 P1 飛行機' })).toBeVisible();
  await expect(page.getByText(/（C列）：攻撃側勝利/)).toBeVisible();
  await page.getByRole('button', { name: '司令部占領', exact: true }).click();
  await page.getByRole('button', { name: 'C7 P1 大将' }).click();
  await page.getByRole('button', { name: 'HQ-P2 空き' }).click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect(page.getByText('P1の勝利', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('result.png'), fullPage: true });
});
test('configuration autosave survives reload but READY is not persisted', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  const before = await page.locator('[data-site="B1"]').getAttribute('aria-label');
  await page.locator('[data-site="B1"]').click(); await page.locator('[data-site="E1"]').click();
  const after = await page.locator('[data-site="B1"]').getAttribute('aria-label'); expect(after).not.toBe(before);
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await page.reload(); await page.getByRole('button', { name: /開発用ローカル対局を開く/ }).click();
  await expect(page.locator('[data-site="B1"]')).toHaveAttribute('aria-label', after!);
  await expect(page.getByRole('button', { name: 'この配置で確定' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('setup.png'), fullPage: true });
});

for (const difficulty of ['かんたん', 'ふつう'] as const) test(`CPU ${difficulty}: setup, hidden pieces, human move, CPU reply`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /CPUと対戦/ }).first().click();
  await page.getByRole('button', { name: new RegExp(`^${difficulty}`) }).click();
  await expect(page.getByRole('heading', { name: 'あなたの陣形' })).toBeVisible();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible({ timeout: 10000 });
  const opponent = page.locator('.cell.side-2');
  const opponentCount = await opponent.count();
  expect(opponentCount).toBeGreaterThanOrEqual(22); // CPU may have moved and fought when chosen to play first.
  expect(opponentCount).toBeLessThanOrEqual(23);
  expect(await opponent.locator('.piece-label').allTextContents()).toEqual(Array(opponentCount).fill('？'));
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
