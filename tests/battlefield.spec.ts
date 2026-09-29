import { expect, test, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /コンピューターと対戦/ }).first().click();
  await page.getByRole('button', { name: /^かんたん/ }).click();
  await page.getByRole('button', { name: 'この配置で確定' }).click();
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
}
async function move(page: Page) {
  const before = Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''));
  const own = page.locator('.cell.side-1');
  for (let i = 0; i < await own.count(); i++) {
    await own.nth(i).click();
    if (await page.locator('.cell.legal').count()) break;
  }
  await page.locator('.cell.legal').first().click();
  await page.getByRole('button', { name: '確定して実行' }).click();
  await expect.poll(async () => Number((await page.locator('.badge').first().textContent())!.replace(/\D/g, ''))).toBeGreaterThanOrEqual(before + 2);
  await expect(page.getByRole('heading', { name: 'あなたの手番' })).toBeVisible();
}
async function boardPieces(page: Page) {
  return page.locator('.cell.side-1, .cell.side-2').evaluateAll(cells => cells.map(cell => {
    const side = cell.classList.contains('side-1') ? '自軍' : '敵軍';
    const name = side === '敵軍' ? '不明' : cell.querySelector('.piece-name')!.textContent;
    return `${cell.getAttribute('data-site')} ${side} ${name}`;
  }).sort());
}

for (const [width, height] of [[1440, 900], [1920, 1080], [390, 844], [430, 932]]) {
  test(`battlefield ${width}x${height}: lazy, safe current position, camera, return and reopen`, async ({ page }, info) => {
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => requests.push(request.url()));
    await page.setViewportSize({ width, height });
    await start(page);
    expect(await page.evaluate(() => {
      const board = document.querySelector('.board')!;
      const button = document.querySelector<HTMLElement>('.battlefield-launch')!;
      const height = board.getBoundingClientRect().height;
      button.style.display = 'none';
      const without = board.getBoundingClientRect().height;
      button.style.removeProperty('display');
      return height - without;
    })).toBe(0);
    expect(requests.some(url => /renderer\.(ts|js)|\/three[._]/.test(url))).toBe(false);
    const boardBefore = await page.locator('.board').boundingBox();
    const initialPieces = await boardPieces(page);
    await page.getByRole('button', { name: '戦場ビュー' }).click();
    const canvas = page.getByRole('img', { name: '閲覧専用の三次元戦場' });
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: '視点を戻す' })).toBeEnabled();
    const list = page.getByRole('list', { name: '三次元表示中の駒' });
    expect((await list.locator('li').allTextContents()).sort()).toEqual(initialPieces);
    const bounds = (await canvas.boundingBox())!;
    expect(bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.height).toBeGreaterThan(200);
    // Confirm the canvas owns a live WebGL context; screenshots verify its content.
    expect(await canvas.evaluate(element => {
      const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
      return gl.isContextLost();
    })).toBe(false);
    await page.screenshot({ path: info.outputPath(`battlefield-${width}x${height}.png`) });
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2 + 35, { steps: 5 }); await page.mouse.up();
    await page.mouse.wheel(0, -200);
    await page.getByRole('button', { name: '視点を戻す' }).click();
    await page.getByRole('button', { name: '二次元盤面へ戻る' }).click();
    await expect(canvas).toHaveCount(0);
    const boardAfter = (await page.locator('.board').boundingBox())!;
    expect({ width: boardAfter.width, height: boardAfter.height }).toEqual({ width: boardBefore!.width, height: boardBefore!.height });
    await move(page);
    const latestPieces = await boardPieces(page);
    expect(latestPieces).not.toEqual(initialPieces);
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.getByRole('button', { name: '戦場ビュー' }).click();
      await expect(canvas).toBeVisible();
      expect((await list.locator('li').allTextContents()).sort()).toEqual(latestPieces);
      expect(await page.locator('.battlefield-stage canvas').count()).toBe(1);
      await page.getByRole('button', { name: '二次元盤面へ戻る' }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
test('unsupported WebGL does not prevent subsequent 2D play', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === 'webgl2') return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await start(page);
  await page.getByRole('button', { name: '戦場ビュー' }).click();
  await expect(page.getByRole('alert')).toContainText('二次元盤面でゲームを続けられます');
  await page.getByRole('button', { name: '二次元盤面へ戻る' }).click();
  await move(page);
});
test('failed lazy module download returns safely to 2D play', async ({ page }) => {
  await start(page);
  await page.route('**/src/battlefield3d/renderer.ts*', route => route.abort());
  await page.getByRole('button', { name: '戦場ビュー' }).click();
  await expect(page.getByRole('alert')).toContainText('二次元盤面でゲームを続けられます');
  await page.getByRole('button', { name: '二次元盤面へ戻る' }).click();
  await move(page);
});
