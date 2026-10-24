import {expect,test,type Page} from '@playwright/test';
import {Vector3} from 'three';
import {displayedCamera} from './battlefieldCamera';
import {sitePoint} from '../src/battlefield3d/state';
import {defaultPlacement} from '../src/dev/fixtures';
import {startGame,applyMove} from '../src/game/game';
import {legalMoves} from '../src/game/movement';
import {chooseCpuMove} from '../src/cpu/strategy';
import {observeForCpu} from '../src/cpu/observation';
import {createSavedMatch,advanceSavedMatch,MATCH_STORAGE_KEY,type SavedCpuMatch} from '../src/save/match';
import type {Site} from '../src/game/types';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
const entry=process.env.BATTLEFIELD_TEST_URL??'/';
const planes=defaultPlacement(1),plane=planes.find(p=>p.type==='aircraft')!;
const hqGame=startGame(planes.map(p=>({...p,position:p.id===plane.id?'HQ-P1':p.position==='HQ-P1'?plane.position:p.position})),defaultPlacement(2),1);
const hq=createSavedMatch(hqGame,'easy',19);
let engineer:SavedCpuMatch|undefined;
for(let seed=1;seed<25&&!engineer;seed++){
 let game=startGame(defaultPlacement(1),defaultPlacement(2),1),match=createSavedMatch(game,'normal',seed);
 for(let i=0;i<200&&!game.result;i++){
  const moves=legalMoves(game.pieces,1),long=moves.find(m=>{const piece=game.pieces.find(p=>p.position===m.from),a=sitePoint(m.from),b=sitePoint(m.to);return piece?.type==='engineer'&&Math.hypot(a.x-b.x,a.z-b.z)>=3;});
  if(game.turn===1&&long){engineer=match;break;}
  game=applyMove(game,chooseCpuMove(observeForCpu(game,game.turn!),'normal',seed+i)!);match=advanceSavedMatch(match,game);
 }
}
if(!engineer)throw new Error('Official long-range engineer fixture missing');
const c=(page:Page)=>page.locator('canvas');
async function clickSite(page:Page,site:Site){const box=(await c(page).boundingBox())!,camera=await displayedCamera(c(page),box.width,box.height),p=sitePoint(site),v=new Vector3(p.x,.13,p.z).project(camera);await page.mouse.click(box.x+(v.x+1)*box.width/2,box.y+(1-v.y)*box.height/2);}
for(const [width,height] of [[390,844],[430,932]])for(const [name,match] of [['aircraft HQ',hq],['long engineer',engineer]] as const)test(`selection fit covers all ${name} destinations ${width}x${height}`,async({page},info)=>{
 await page.setViewportSize({width,height});await page.addInitScript(({key,data})=>localStorage.setItem(key,data),{key:MATCH_STORAGE_KEY,data:JSON.stringify(match)});await page.goto(entry);await page.getByRole('button',{name:/続きから/}).click();await expect(c(page)).toBeVisible();
 const before=await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY),move=legalMoves(match.game.pieces,1).find(m=>name.startsWith('aircraft')?m.from==='HQ-P1'&&m.to==='HQ-P2':match.game.pieces.find(p=>p.position===m.from)?.type==='engineer'&&Math.hypot(sitePoint(m.from).x-sitePoint(m.to).x,sitePoint(m.from).z-sitePoint(m.to).z)>=3)!;
 await clickSite(page,move.from);await expect(c(page)).toHaveAttribute('data-camera-preset','selection-fit');await expect(c(page)).not.toHaveAttribute('data-camera-fitting','true');
 const box=(await c(page).boundingBox())!,camera=await displayedCamera(c(page),box.width,box.height);
 for(const site of new Set([move.from,...legalMoves(match.game.pieces,1).filter(m=>m.from===move.from).map(m=>m.to)])){const p=sitePoint(site);for(const dx of site.startsWith('HQ')?[-1,1]:[-.52,.52]){const v=new Vector3(p.x+dx,.13,p.z).project(camera);expect(Math.abs(v.x)).toBeLessThan(.95);expect(v.y).toBeGreaterThan(-.95);expect(v.y).toBeLessThan(.95);}}
 await page.screenshot({path:info.outputPath('selection-fit.png')});await clickSite(page,move.to);if(name.startsWith('aircraft')){const commands=page.getByRole('region',{name:'主要COMMAND'});await expect(commands.getByRole('button',{name:'三次元 D列'})).toBeVisible();await commands.getByRole('button',{name:'三次元 C列'}).click();}await expect(page.getByRole('button',{name:'確定して実行',exact:true})).toBeEnabled();
 expect(await page.evaluate(key=>localStorage.getItem(key),MATCH_STORAGE_KEY)).toBe(before);await page.getByRole('button',{name:'選択を解除',exact:true}).click();await expect(c(page)).toHaveAttribute('data-camera-preset','full');
 await page.getByRole('button',{name:'その他',exact:true}).click();await page.locator('.battlefield-settings summary').click();await page.getByLabel('選択時に自動拡大').uncheck();await page.getByRole('button',{name:'詳細を閉じる'}).click();await clickSite(page,move.from);await expect(c(page)).toHaveAttribute('data-camera-preset','full');expect(await page.evaluate(()=>localStorage.getItem('military-chess:selection-zoom:v1'))).toBe('false');
});
test('reduced-motion selection fit is instant and cancel restores full view',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(entry);await page.getByRole('button',{name:/コンピューターと対戦/}).first().click();await page.getByRole('button',{name:/^かんたん/}).click();await expect(c(page)).toBeVisible();await clickSite(page,'B1');await expect(c(page)).toHaveAttribute('data-camera-preset','selection-fit');await expect(c(page)).not.toHaveAttribute('data-camera-fitting','true');await page.getByRole('button',{name:'選択を解除',exact:true}).click();await expect(c(page)).toHaveAttribute('data-camera-preset','full');
});
