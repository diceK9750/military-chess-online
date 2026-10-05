import {expect,test} from '@playwright/test';
import {defaultPlacement} from '../src/dev/fixtures';
import {startGame,applyMove} from '../src/game/game';
import {chooseCpuMove} from '../src/cpu/strategy';
import {observeForCpu} from '../src/cpu/observation';
import {advanceSavedMatch,createSavedMatch,MATCH_STORAGE_KEY} from '../src/save/match';
import {chronicleFrames} from '../src/intelligence/chronicle';
import {chronicleStory} from '../src/intelligence/chronicleStory';
import {PIECES} from '../src/game/pieces';
import {readFile} from 'node:fs/promises';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
const entry=process.env.BATTLEFIELD_TEST_URL??'/';
let game=startGame(defaultPlacement(1),defaultPlacement(2),1),match=createSavedMatch(game,'normal',9750);
for(let i=0;i<1000&&!game.result;i++){game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'normal',9750+i)!);match=advanceSavedMatch(match,game);}
const story=chronicleStory(chronicleFrames(game,match.initialPlacements)),battle=game.events.find(e=>e.kind==='MOVE'&&e.battle)!;
if(battle.kind!=='MOVE')throw Error('No official battle');
for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[430,932],[390,844]])test(`cinematic squads, quality, chapters and PNG ${width}x${height}`,async({page},info)=>{
 test.setTimeout(60000); // Three quality rebuilds, all chapters and two PNG exports.
 await page.setViewportSize({width,height});await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);Object.defineProperty(navigator,'share',{value:undefined,configurable:true});Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});},{key:MATCH_STORAGE_KEY,value:JSON.stringify(match)});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(entry);await page.getByRole('button',{name:/続きから/}).click();
 const before=await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY);
 await page.getByRole('button',{name:'戦史再現',exact:true}).click();const canvas=page.locator('canvas');await expect(canvas).toHaveAttribute('data-mode','cinematic');await expect(canvas).toHaveAttribute('data-unit-count','46');
 await page.screenshot({path:info.outputPath('cinema-opening.png'),fullPage:true});
 await page.locator('.battlefield-key summary').click();await expect(page.locator('.piece-legend>div')).toHaveCount(16);await page.locator('.battlefield-key summary').click();
 await page.getByRole('combobox',{name:'カメラの詳細視点'}).selectOption('front');await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(100);await canvas.screenshot({path:info.outputPath('cinema-identities-front.png')});
 await page.getByRole('combobox',{name:'カメラの詳細視点'}).selectOption('top');await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(100);await canvas.screenshot({path:info.outputPath('cinema-identities-top.png')});await page.waitForTimeout(3100);
 await page.getByText(/戦場設定 ·/).click();const settings=page.getByRole('combobox',{name:'描画品質'});
 const budgets:unknown[]=[];
 for(const [quality,followers] of [['high','3'],['standard','2'],['light','1']] as const){await settings.selectOption(quality);await expect(canvas).toHaveAttribute('data-quality',quality);await expect(canvas).toHaveAttribute('data-followers',followers);await expect.poll(async()=>Number(await canvas.getAttribute('data-draw-calls'))).toBeLessThan(300);budgets.push({quality,calls:await canvas.getAttribute('data-draw-calls'),triangles:await canvas.getAttribute('data-triangles'),pixelRatio:await canvas.getAttribute('data-pixel-ratio')});}
 await info.attach('cinema-budgets.json',{body:Buffer.from(JSON.stringify(budgets)),contentType:'application/json'});
 await page.getByRole('checkbox',{name:'戦況レイヤー'}).check();expect(JSON.parse((await page.evaluate(()=>localStorage.getItem('military-chess:visual-settings:v1')))!).quality).toBe('light');
 await page.getByText(/戦場設定 ·/).click();await page.getByRole('button',{name:'次の手',exact:true}).click();await expect(canvas).toHaveAttribute('data-shot',/march|battle|breach|pressure/);await page.screenshot({path:info.outputPath('cinema-march.png'),fullPage:true});
 await page.clock.install();const now=await page.evaluate(()=>Date.now());await page.clock.pauseAt(new Date(now+60000));await page.getByRole('slider',{name:'再現手数'}).fill(String(battle.moveNumber-1));await page.clock.runFor(1400);await page.getByRole('button',{name:'次の手',exact:true}).click();await page.clock.runFor(1500);
 await expect(canvas).toHaveAttribute('data-battle-phase','contact');await page.screenshot({path:info.outputPath('cinema-contact.png'),fullPage:true});
 await page.clock.runFor(1250);await expect(canvas).not.toHaveAttribute('data-battle-effect',/./);
 for(const chapter of story.chapters){await page.getByRole('button',{name:`${chapter.title} 第${chapter.index}手`,exact:true}).click();await expect(page.getByRole('status',{name:'戦史解説'})).toContainText(story.scenes[chapter.index].text);}
 await page.clock.runFor(250);await expect(canvas).toHaveAttribute('data-shot','summary');
 await canvas.scrollIntoViewIfNeeded();await page.clock.runFor(100);
 await canvas.screenshot({path:info.outputPath('cinema-final.png')});
 for(const button of ['名場面を保存','名場面を共有']){const promise=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();const download=await promise;const path=info.outputPath(button==='名場面を保存'?'scene.png':'share-fallback.png');await download.saveAs(path);const bytes=await readFile(path);expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(bytes.length).toBeGreaterThan(15000);expect(bytes.readUInt32BE(16)).toBeLessThanOrEqual(1600);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(Number(await canvas.getAttribute('data-draw-calls'))).toBeGreaterThan(0);expect(Number(await canvas.getAttribute('data-triangles'))).toBeGreaterThan(0);
 await page.getByRole('button',{name:'結果画面へ戻る',exact:true}).click();expect(await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY)).toBe(before);await page.reload();await page.getByRole('button',{name:/続きから/}).click();await expect(page.getByRole('status',{name:'対局結果'})).toBeVisible();expect(errors).toEqual([]);
});


test('portrait replay controls survive resizing and every seek matches the official saved history', async ({page}) => {
 test.setTimeout(60_000);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key:MATCH_STORAGE_KEY,value:JSON.stringify(match)});
 await page.goto(entry);await page.getByRole('button',{name:/続きから/}).click();
 const saved=await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY);
 await page.getByRole('button',{name:'戦史再現',exact:true}).click();
 const canvas=page.getByRole('img',{name:'操作可能な三次元戦場'}),slider=page.getByRole('slider',{name:'再現手数'});
 await expect(canvas).toHaveAttribute('data-mode','cinematic');
 await expect(page.getByRole('complementary',{name:'全体位置図・自軍が下'})).toBeVisible();
 for(const [width,height] of [[390,664],[320,568],[360,640],[430,932],[390,844]]) {
  await page.setViewportSize({width,height});await page.evaluate(()=>{scrollTo(0,0);return new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  await expect(canvas).toBeInViewport({ratio:1});
  expect((await canvas.boundingBox())!.height).toBeGreaterThanOrEqual(160);
  for(const name of ['前の手','再生','次の手']) {
   const control=page.getByRole('button',{name,exact:true});await expect(control).toBeInViewport({ratio:1});expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('combobox',{name:'再現速度'})).toBeInViewport({ratio:1});await expect(slider).toBeInViewport({ratio:1});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const frames=chronicleFrames(match.game,match.initialPlacements);
 // Include backward and repeated seeking, a real battle, and the decisive final move.
 for(const index of [0,1,battle.moveNumber-1,battle.moveNumber,Math.floor(game.moveCount/2),game.moveCount,game.moveCount-1,0,battle.moveNumber]) {
  await slider.fill(String(index));await expect(slider).toHaveValue(String(index));
  const frame=frames[index],event=[...frame.events].reverse().find(event=>event.kind==='MOVE');
  const expected=frame.pieces.filter(piece=>piece.position).map(piece=>`${piece.position} ${piece.owner===1?'自軍':'敵軍'} ${PIECES[piece.type].label}`).sort();
  const visible=await page.getByRole('list',{name:'三次元表示中の駒'}).locator('li').allTextContents();
  expect(visible.sort()).toEqual(expected);
  await expect(canvas).toHaveAttribute('data-unit-count',String(expected.length));
  if(event?.kind==='MOVE')await expect(canvas).toHaveAttribute('data-last-move',`${event.move.from}/${event.move.to}`);
  else await expect(canvas).not.toHaveAttribute('data-last-move',/./);
  await expect(page.getByRole('status',{name:'再現中の手'})).toContainText(`第${index}手`);
  await expect(page.getByRole('status',{name:'戦史解説'})).toContainText(story.scenes[index].text);
  expect(await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY)).toBe(saved);
 }
 await page.setViewportSize({width:844,height:390});await page.setViewportSize({width:390,height:844});
 await slider.fill(String(game.moveCount));await page.getByRole('button',{name:'最初から再生',exact:true}).click();
 await expect(page.getByRole('button',{name:'一時停止',exact:true})).toBeVisible();await page.getByRole('button',{name:'一時停止',exact:true}).click();
 const paused=await slider.inputValue();await page.waitForTimeout(1600);await expect(slider).toHaveValue(paused);
 await page.getByRole('button',{name:'結果画面へ戻る',exact:true}).click();
 expect(await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY)).toBe(saved);
 await page.reload();await page.getByRole('button',{name:/続きから/}).click();
 await expect(page.getByRole('status',{name:'対局結果'})).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY)).toBe(saved);
});
