import {expect,test} from '@playwright/test';
import {defaultPlacement} from '../src/dev/fixtures';
import {startGame,applyMove} from '../src/game/game';
import {chooseCpuMove} from '../src/cpu/strategy';
import {observeForCpu} from '../src/cpu/observation';
import {advanceSavedMatch,createSavedMatch,MATCH_STORAGE_KEY} from '../src/save/match';
import {chronicleFrames} from '../src/intelligence/chronicle';
import {chronicleStory} from '../src/intelligence/chronicleStory';
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
