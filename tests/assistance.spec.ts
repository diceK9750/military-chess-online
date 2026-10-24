import {openExtras} from './mobileControls';
import { expect, test } from '@playwright/test';
import { startGame } from '../src/game/game';
import { defaultPlacement } from '../src/dev/fixtures';
import { legalMoves } from '../src/game/movement';
import { createSavedMatch, MATCH_STORAGE_KEY } from '../src/save/match';
test.use({ launchOptions: { args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] } });
const entry=process.env.BATTLEFIELD_TEST_URL??'/';
for(const fallback of [false,true]) test(`own piece selection, repeated clicks and autosave ${fallback?'2D fallback':'3D'}`,async({page},info)=>{
  const game=startGame(defaultPlacement(1),defaultPlacement(2),1);
  const move=legalMoves(game.pieces,1).find(move=>!move.lane)!;
  const saved=createSavedMatch(game,'easy',42);
  await page.addInitScript(({key,value,fallback})=>{
    localStorage.setItem(key,value);
    if(fallback){const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this: HTMLCanvasElement,kind:string,...args:unknown[]){if(kind==='webgl2'||kind==='webgl'||kind==='experimental-webgl')return null;return original.call(this,kind,...args as [])} as typeof original;}
  },{key:MATCH_STORAGE_KEY,value:JSON.stringify(saved),fallback});
  await page.goto(entry); await page.getByRole('button',{name:'続きから'}).click();
  if(fallback)await expect(page.locator('.board')).toBeVisible();else await expect(page.getByRole('img',{name:'操作可能な三次元戦場'})).toBeVisible();
  await openExtras(page);await page.locator('.own-piece-list summary').click();
  const own=page.locator(`.own-piece-list button[data-own-site="${move.from}"]`);
  await expect(page.locator('.own-piece-list button')).toHaveCount(23);
  await own.click();await expect(own).toHaveAttribute('aria-pressed','true');
  await own.click();await expect(own).toHaveAttribute('aria-pressed','false');await own.click();
  if(fallback)await page.locator(`.board button[data-site="${move.to}"]`).click();
  else {await page.locator('.destination-list summary').click();await page.locator(`[data-target="${move.to}"]`).click();}
  await page.getByRole('button',{name:'確定して実行'}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();button.click();});
  await expect.poll(async()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).game.moveCount,MATCH_STORAGE_KEY)).toBeGreaterThanOrEqual(2);
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),MATCH_STORAGE_KEY);
  expect(after.game.events.filter((e:any)=>e.kind==='MOVE'&&e.actor===1)).toHaveLength(1);
  await page.screenshot({path:info.outputPath(`own-pieces-${fallback?'fallback':'3d'}.png`),fullPage:true});
  // Reload without reinjecting the initial save.
  await openExtras(page);await page.getByRole('button',{name:'タイトルへ',exact:true}).click();await page.getByRole('button',{name:'続きから'}).click();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).game.moveCount,MATCH_STORAGE_KEY)).toBe(after.game.moveCount);
});
test('CPU calculation failure pauses until one manual retry and saves one move',async({page})=>{
  const saved=createSavedMatch(startGame(defaultPlacement(1),defaultPlacement(2),2),'normal',42);
  await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:MATCH_STORAGE_KEY,value:JSON.stringify(saved)});
  await page.route('**/src/cpu/turn.ts',async route=>{
    const response=await route.fetch();const source=await response.text();
    const needle='validateState(state);';expect(source).toContain(needle);
    await route.fulfill({response,body:source.replace(needle,`globalThis.__cpuAttempts = (globalThis.__cpuAttempts || 0) + 1; if (globalThis.__cpuAttempts === 1) throw new Error('test CPU calculation failure'); ${needle}`)});
  });
  await page.goto(entry);await page.getByRole('button',{name:'続きから'}).click();
  const retry=page.getByRole('button',{name:'コンピューターの着手を再試行'});await expect(retry).toBeVisible();
  await page.waitForTimeout(250);
  expect(await page.evaluate(()=>(globalThis as any).__cpuAttempts)).toBe(1);
  await retry.evaluate((button:HTMLButtonElement)=>{button.click();button.click();button.click();});
  await expect(page.getByRole('heading',{name:'あなたの手番'})).toBeVisible();
  expect(await page.evaluate(()=>(globalThis as any).__cpuAttempts)).toBe(2);
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).game.moveCount,MATCH_STORAGE_KEY)).toBe(1);
  await expect(retry).toHaveCount(0);
});
