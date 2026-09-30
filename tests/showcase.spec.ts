import { expect, test, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { defaultPlacement } from '../src/dev/fixtures';
import { startGame, applyMove } from '../src/game/game';
import { legalMoves } from '../src/game/movement';
import { chooseCpuMove } from '../src/cpu/strategy';
import { observeForCpu } from '../src/cpu/observation';
import { createSavedMatch, advanceSavedMatch, validateSavedMatch, MATCH_STORAGE_KEY, type SavedCpuMatch } from '../src/save/match';
import { chronicleFrames } from '../src/intelligence/chronicle';
import { chronicleStory } from '../src/intelligence/chronicleStory';
import { fullCameraDistance } from '../src/battlefield3d/camera';
import { sitePoint } from '../src/battlefield3d/state';
import type { Site } from '../src/game/types';
test.use({ launchOptions: { args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] } });
const entry = process.env.BATTLEFIELD_TEST_URL ?? '/';
let game=startGame(defaultPlacement(1),defaultPlacement(2),1), defeat=createSavedMatch(game,'normal',9750);
for(let i=0;i<1000&&!game.result;i++) {game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'normal',9750+i)!);defeat=advanceSavedMatch(defeat,game);}
if(game.result?.winner!==2)throw new Error('Expected official defeat fixture');
let victory=defeat,beforeVictory=defeat;
for(let seed=1;seed<=40;seed++) {
  let candidate=startGame(defaultPlacement(1),defaultPlacement(2),1),saved=createSavedMatch(candidate,'normal',seed),previous=saved;
  for(let i=0;i<1000&&!candidate.result;i++) {
    previous=saved;candidate=applyMove(candidate,chooseCpuMove(observeForCpu(candidate,candidate.turn!),'normal',seed+i)!);saved=advanceSavedMatch(saved,candidate);
  }
  const lastEvent=candidate.events.filter(e=>e.kind==='MOVE').at(-1);
  if(candidate.result?.winner===1&&lastEvent?.actor===1) { victory=saved;beforeVictory=previous;break; }
}
if(victory.game.result?.winner!==1)throw new Error('Expected official victory fixture');
const last=victory.game.events.filter(e=>e.kind==='MOVE').at(-1)!;
let peaceful=startGame(defaultPlacement(1),defaultPlacement(2),1),draw=createSavedMatch(peaceful,'normal',9750);
for(let i=0;i<1000&&!peaceful.result;i++) {
  const safe=legalMoves(peaceful.pieces,peaceful.turn!).find(m=>!m.to.startsWith('HQ-')&&!peaceful.pieces.some(p=>p.position===m.to));
  peaceful=applyMove(peaceful,safe??chooseCpuMove(observeForCpu(peaceful,peaceful.turn!),'normal',9750+i)!);
  draw=advanceSavedMatch(draw,peaceful);
}
if(draw.game.result?.winner!==null)throw new Error('Expected official draw fixture');
for(const match of [defeat,victory,beforeVictory,draw])validateSavedMatch(match);
async function prepare(page:Page,match:SavedCpuMatch) {
  await page.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,data);},{key:MATCH_STORAGE_KEY,data:JSON.stringify(match)});
  await page.goto(entry);await page.getByRole('button',{name:/続きから/}).click();
  await expect(page.getByRole('img',{name:'操作可能な三次元戦場'})).toBeVisible();
}
async function clickSite(page:Page,site:Site) {
  const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();
  const b=(await canvas.boundingBox())!,camera=new PerspectiveCamera(42,b.width/b.height,.1,100),d=fullCameraDistance(camera.aspect);
  camera.position.set(0,d*.86,d*.6);camera.lookAt(0,.25,0);camera.updateMatrixWorld();
  const p=sitePoint(site),point=new Vector3(p.x,.2,p.z).project(camera);
  await page.mouse.click(b.x+(point.x+1)*b.width/2,b.y+(1-point.y)*b.height/2);
}

test('live human victory celebrates once, actions remain usable and replay preserves save',async({page},info)=>{
  await page.setViewportSize(info.project.name==='mobile'?{width:390,height:844}:{width:1440,height:900});
  await page.addInitScript(()=>{Object.assign(window,{victoryTones:0,victoryDucks:0});const native=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){(window as unknown as {victoryTones:number}).victoryTones++;return native.call(this);};window.addEventListener('military-chess:celebration-audio',()=>{(window as unknown as {victoryDucks:number}).victoryDucks++;});});
  await prepare(page,beforeVictory);
  await page.getByRole('button',{name:'効果音 ONにする'}).click();await page.getByRole('button',{name:'BGM ONにする'}).click();await expect(page.getByRole('button',{name:'BGM OFFにする'})).toBeVisible();
  await clickSite(page,last.move.from);await clickSite(page,last.move.to);
  await page.getByRole('button',{name:'確定して実行'}).click();
  const result=page.getByRole('status',{name:'対局結果'});
  await expect(result).toContainText('あなたの勝利');await expect(result).toHaveClass(/result-victory/);await expect(result).toBeInViewport({ratio:1});
  await expect(page.locator('.victory-celebration')).toHaveAttribute('data-active','true');
  expect(await page.locator('.victory-celebration').evaluate(e=>getComputedStyle(e).pointerEvents)).toBe('none');
  expect(await page.evaluate(()=>(window as unknown as {victoryDucks:number}).victoryDucks)).toBe(1);
  expect(await page.evaluate(()=>(window as unknown as {victoryTones:number}).victoryTones)).toBeGreaterThanOrEqual(7);
  expect(await page.locator('audio').evaluate(e=>(e as HTMLAudioElement).volume)).toBe(.0625);
  await expect(page.locator('.victory-celebration')).toHaveAttribute('data-fresh','true');
  expect(await page.locator('.victory-celebration .petal').count()).toBeGreaterThan(10);
  await expect(page.locator('.salute-cannon')).toHaveCount(info.project.name==='mobile'?2:4);
  await expect(page.locator('canvas')).toHaveAttribute('data-ceremony','decisive-replay');
  await page.waitForTimeout(1300);
  await page.screenshot({path:info.outputPath('victory.png'),fullPage:true});
  await expect(page.locator('.victory-celebration i')).toHaveCount(0,{timeout:6000});
  expect(await page.locator('audio').evaluate(e=>(e as HTMLAudioElement).volume)).toBe(.25);
  const saved=await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY);
  expect(JSON.parse(saved!).game).toEqual(victory.game);
  await result.getByRole('button',{name:'戦史再現'}).click();
  const story=chronicleStory(chronicleFrames(victory.game,victory.initialPlacements));
  await expect(page.getByRole('status',{name:'戦史解説'})).toContainText('開戦');
  await expect(page.locator('.victory-celebration')).toHaveCount(0);
  const chapters=page.getByRole('navigation',{name:'戦史の見どころ'});
  for(const chapter of story.chapters) {
    await chapters.getByRole('button',{name:chapter.title+' 第'+chapter.index+'手',exact:true}).click();
    await expect(page.getByRole('slider',{name:'再現手数'})).toHaveValue(String(chapter.index));
    await expect(page.getByRole('status',{name:'戦史解説'})).toContainText(story.scenes[chapter.index].text);
  }
  await expect(page.getByRole('status',{name:'戦史解説'})).toContainText('自軍の勝利');
  await page.locator('canvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.locator('canvas').screenshot({path:info.outputPath('movie-hq-capture.png')});
  await page.getByRole('button',{name:'最初から再生'}).click();
  await expect(page.getByRole('button',{name:'一時停止'})).toBeVisible();await page.getByRole('button',{name:'一時停止'}).click();
  await page.screenshot({path:info.outputPath('theater.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'結果画面へ戻る'}).click();
  expect(await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY)).toBe(saved);
  await page.reload();await page.getByRole('button',{name:/続きから/}).click();await expect(result).toContainText('あなたの勝利');await expect(page.locator('.victory-celebration')).toHaveAttribute('data-fresh','false');await expect(page.locator('.salute-cannon')).toHaveCount(0);
});
for(const [label,match,style] of [['敗北',defeat,'defeat'],['引き分け',draw,'draw']] as const)test(`${label} is distinct, not celebrated, and explained in final replay`,async({page},info)=>{
  await prepare(page,match);const result=page.getByRole('status',{name:'対局結果'});
  await expect(result).toContainText(label);await expect(result).toHaveClass(new RegExp('result-'+style));await expect(page.locator('.victory-celebration')).toHaveCount(0);
  await result.getByRole('button',{name:'戦史再現'}).click();await page.getByRole('slider',{name:'再現手数'}).fill(String(match.game.moveCount));
  await expect(page.getByRole('status',{name:'戦史解説'})).toContainText(label==='敗北'?'CPUの勝利':'引き分け');
  await expect(page.getByRole('status',{name:'戦史解説'})).toContainText('全'+match.game.moveCount+'手');
  await page.screenshot({path:info.outputPath(style+'-summary.png'),fullPage:true});
});
test('reduced motion disables victory confetti and replay movement without losing results',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await prepare(page,victory);
  await expect(page.getByRole('status',{name:'対局結果'})).toContainText('あなたの勝利');await expect(page.locator('.victory-celebration i')).toHaveCount(0);
  await page.getByRole('button',{name:'戦史再現',exact:true}).click();await page.getByRole('button',{name:'次の手'}).click();
  await expect(page.getByRole('status',{name:'再現中の手'})).toContainText('第1手');await expect(page.locator('canvas')).not.toHaveAttribute('data-battle-effect',/./);
});
