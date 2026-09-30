import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { defaultPlacement } from '../src/dev/fixtures';
import { startGame, applyMove } from '../src/game/game';
import { chooseCpuMove } from '../src/cpu/strategy';
import { observeForCpu } from '../src/cpu/observation';
import { createSavedMatch, advanceSavedMatch, MATCH_STORAGE_KEY } from '../src/save/match';
test.use({ launchOptions: { args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] } });
const entry = process.env.BATTLEFIELD_TEST_URL ?? '/';
function terminalMatch() {
  let game=startGame(defaultPlacement(1),defaultPlacement(2),1),match=createSavedMatch(game,'normal',9750);
  for(let i=0;i<1000&&!game.result;i++) {
    game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'normal',9750+i)!);
    match=advanceSavedMatch(match,game);
  }
  if(!game.result)throw new Error('Official game did not terminate');
  return match;
}
const match=terminalMatch();
async function prepare(page:Page) {
  await page.addInitScript(({key,data})=>localStorage.setItem(key,data),{key:MATCH_STORAGE_KEY,data:JSON.stringify(match)});
  await page.goto(entry);await page.getByRole('button',{name:/続きから/}).click();
  await expect(page.getByRole('img',{name:'操作可能な三次元戦場'})).toBeVisible();
}
for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[430,932],[390,844]])test(`prominent final result and decisive move ${width}x${height}`,async({page},info)=>{
  await page.setViewportSize({width,height});await prepare(page);
  const panel=page.getByRole('status',{name:'対局結果'});
  await expect(panel).toBeInViewport({ratio:1});
  await expect(panel).toContainText(match.game.result!.winner===1?'あなたの勝利':match.game.result!.winner===2?'あなたの敗北':'引き分け');
  await expect(panel).toContainText('終局理由：');
  const last=match.game.events.filter(e=>e.kind==='MOVE').at(-1)!;
  await expect(panel).toContainText(`${last.move.from} → ${last.move.to}`);
  await expect(page.getByLabel('直前の手',{exact:true})).toContainText(last.actor===1?'自軍':'CPU');
  await expect(page.locator('canvas')).toHaveAttribute('data-last-move',`${last.move.from}/${last.move.to}`);
  expect(await panel.locator('strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(30);
  const stage=(await page.locator('.battlefield-stage').boundingBox())!,result=(await panel.boundingBox())!;
  expect(result.x).toBeGreaterThanOrEqual(stage.x);expect(result.x+result.width).toBeLessThanOrEqual(stage.x+stage.width+1);
  expect(result.y).toBeGreaterThanOrEqual(stage.y);expect(result.y+result.height).toBeLessThanOrEqual(stage.y+stage.height+1);
  for(const name of ['新しい対局','戦史再現','結果を保存'])expect((await panel.getByRole('button',{name,exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('endgame.png'),fullPage:true});
  const saved=await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY);
  await page.getByRole('button',{name:'直前の手を追う'}).click();
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-preset','last');
  await panel.getByRole('button',{name:'戦史再現',exact:true}).click();
  await expect(page.getByLabel('戦史再現',{exact:true})).toBeVisible();await expect(page.getByRole('status',{name:'対局結果'})).toHaveCount(0);
  await page.getByRole('button',{name:'結果画面へ戻る'}).click();await expect(panel).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY)).toBe(saved);
  await page.reload();await page.getByRole('button',{name:/続きから/}).click();await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:'新しい対局',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'新しい対局の確認'})).toBeVisible();
  await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  await page.getByRole('button',{name:/続きから/}).click();await expect(panel).toBeVisible();
});
test('result action exports and reloads the unchanged encrypted terminal match',async({page})=>{
  await prepare(page);const password=randomUUID();
  await page.getByRole('button',{name:'結果を保存'}).click();
  await page.getByLabel('パスワード',{exact:true}).fill(password);await page.getByLabel('パスワード（確認）').fill(password);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'ファイルを保存'}).click()]);
  const buffer=await readFile((await download.path())!);expect(buffer.toString()).not.toContain(password);expect(buffer.toString()).not.toContain('initialPlacements');
  await expect(page.getByRole('status',{name:'対局結果'})).toBeVisible();
  await page.getByRole('button',{name:'タイトルへ',exact:true}).click();
  await page.getByRole('button',{name:'保存した対局を読み込む'}).click();
  await page.getByLabel('対局ファイル').setInputFiles({name:download.suggestedFilename(),mimeType:'application/json',buffer});
  await page.getByLabel('パスワード',{exact:true}).fill(password);await page.getByRole('button',{name:'対局を読み込む'}).click();
  await page.getByRole('button',{name:'読み込んだ対局へ置き換える'}).click();
  await expect(page.getByRole('status',{name:'対局結果'})).toBeVisible();
  expect(JSON.parse((await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY))!).game).toEqual(match.game);
});
