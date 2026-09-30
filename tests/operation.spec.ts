import { expect, test, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { fullCameraDistance } from '../src/battlefield3d/camera';
import { sitePoint } from '../src/battlefield3d/state';
import { defaultPlacement } from '../src/dev/fixtures';
import { applyMove, startGame } from '../src/game/game';
import { legalMoves } from '../src/game/movement';
import { PIECES, PIECE_TYPES } from '../src/game/pieces';
import type { Site } from '../src/game/types';
import { advanceSavedMatch, createSavedMatch, MATCH_STORAGE_KEY } from '../src/save/match';

test.use({ launchOptions: { args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] } });
const entry=process.env.BATTLEFIELD_TEST_URL??'/';
const canvasName='操作可能な三次元戦場';
const canvas=(page:Page)=>page.getByRole('img',{name:canvasName});
async function point(page:Page,site:Site,height=.31,offset=0) {
  await canvas(page).scrollIntoViewIfNeeded();
  const b=(await canvas(page).boundingBox())!,c=new PerspectiveCamera(42,b.width/b.height,.1,100),d=fullCameraDistance(c.aspect);
  c.position.set(0,d*.86,d*.6);c.lookAt(0,.25,0);c.updateMatrixWorld();
  const p=sitePoint(site),v=new Vector3(p.x+offset,height,p.z).project(c);
  return {x:b.x+(v.x+1)*b.width/2,y:b.y+(1-v.y)*b.height/2};
}
async function drag(page:Page,from:Site,to:Site,touch:boolean,offset=0,cancel=false) {
  const a=await point(page,from),b=await point(page,to,.075,offset);
  if(touch) {
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,id:1}]});
    await expect(canvas(page)).toHaveAttribute('data-dragging',from);
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    await cdp.detach();
  } else {
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});
    await expect(canvas(page)).toHaveAttribute('data-dragging',from);
    if(cancel)await canvas(page).dispatchEvent('pointercancel',{pointerId:1});
    await page.mouse.up();
  }
  await expect(canvas(page)).not.toHaveAttribute('data-dragging',/./);
}
async function setup(page:Page) {
  await page.goto(entry);await page.getByRole('button',{name:/コンピューターと対戦/}).first().click();await page.getByRole('button',{name:/^かんたん/}).click();await expect(canvas(page)).toBeVisible();
}
async function tap(page:Page,site:Site,touch:boolean) {const p=await point(page,site);if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);}
async function saved(page:Page) { return page.evaluate(()=>JSON.parse(localStorage.getItem('military-chess:cpu-match:v1')!)); }

for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[430,932],[390,844]]) {
  test(`own 23-piece identity and HQ affiliation ${width}x${height}`,async({page},info)=>{
    await page.setViewportSize({width,height});await setup(page);
    const lines=await page.getByRole('list',{name:'三次元表示中の駒'}).locator('li').allTextContents();
    expect(lines).toHaveLength(23);expect(lines.every(l=>l.includes('自軍')&&!l.includes('不明'))).toBe(true);
    for(const type of PIECE_TYPES)expect(lines.filter(l=>l.endsWith(' '+PIECES[type].label))).toHaveLength(PIECES[type].count);
    await expect(page.locator('.own-hq')).toContainText('HQ-P1 · 自軍');await expect(page.locator('.own-hq')).not.toContainText('?');
    await page.screenshot({path:info.outputPath('identity-'+width+'.png'),fullPage:true});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const b=(await canvas(page).boundingBox())!;expect(b.height).toBeGreaterThan(width>=1400?350:430);
    await page.reload();await page.getByRole('button',{name:/続きから/}).click();await expect(canvas(page)).toBeVisible();
    expect(await page.getByRole('list',{name:'三次元表示中の駒'}).locator('li').allTextContents()).toEqual(lines);
  });
}
test('mouse/touch setup drag exchanges once, invalid and cancelled drops preserve all pieces',async({page,isMobile})=>{
  await setup(page);
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('military-chess:cpu-setup:v1')!));
  const before=await read();await drag(page,'B1','E1',!!isMobile);await expect(page.locator('.notice')).toContainText('入れ替え');
  expect((await read()).pieces).toEqual(before.pieces.map((p:{position:Site})=>({...p,position:p.position==='B1'?'E1':p.position==='E1'?'B1':p.position})));
  const after=await read(),flag=after.pieces.find((p:{type:string})=>p.type==='flag');
  await drag(page,flag.position,'B4',!!isMobile);expect(await read()).toEqual(after);
  await drag(page,'B1','E1',!!isMobile,0,true);expect(await read()).toEqual(after);
  await expect(page.locator('.board')).toHaveCount(0);
});
test('pinch beginning on an own piece cancels dragging and preserves placement',async({page})=>{
  await setup(page);const before=await page.evaluate(()=>localStorage.getItem('military-chess:cpu-setup:v1'));
  const a=await point(page,'B1'),b=await point(page,'E1');const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+15,y:a.y,id:1}]});
  await expect(canvas(page)).toHaveAttribute('data-dragging','B1');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+15,y:a.y,id:1},{...b,id:2}]});
  await expect(canvas(page)).not.toHaveAttribute('data-dragging',/./);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x-15,y:a.y,id:1},{x:b.x+15,y:b.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await page.evaluate(()=>localStorage.getItem('military-chess:cpu-setup:v1'))).toBe(before);await cdp.detach();
});
test('3D drag executes official move once, CPU replies, save/resume and retap remain available',async({page,isMobile},info)=>{
  await setup(page);await page.getByRole('button',{name:'この配置で確定'}).click();await expect(page.getByRole('heading',{name:'あなたの手番'})).toBeVisible();
  await expect(canvas(page)).not.toHaveAttribute('data-battle-effect',/./);await page.waitForTimeout(400);
  const before=await saved(page),move=legalMoves(before.game.pieces,1)[0];
  await drag(page,move.from,move.to,!!isMobile,move.lane==='C'?-.5:move.lane==='D'?.5:0);
  await expect.poll(async()=> (await saved(page)).game.moveCount).toBe(before.game.moveCount+2);
  await expect(page.getByRole('heading',{name:'あなたの手番'})).toBeVisible();
  const after=await saved(page);expect(after.game.events.filter((e:{kind:string})=>e.kind==='MOVE').slice(-2)[0].move).toEqual(move);
  await expect(canvas(page)).not.toHaveAttribute('data-battle-effect',/./);await page.waitForTimeout(400);
  const next=legalMoves(after.game.pieces,1)[0];await tap(page,next.from,!!isMobile);await tap(page,next.to,!!isMobile);
  if(next.lane)await page.getByRole('button',{name:'三次元 '+next.lane+'列'}).click();
  await expect(page.locator('.confirm')).toBeVisible();await tap(page,next.to,!!isMobile);
  await expect.poll(async()=> (await saved(page)).game.moveCount).toBe(after.game.moveCount+2);
  await expect(canvas(page)).not.toHaveAttribute('data-battle-effect',/./);await page.waitForTimeout(400);
  const final=await saved(page);await page.screenshot({path:info.outputPath('operation.png'),fullPage:true});
  await page.reload();await page.getByRole('button',{name:/続きから/}).click();await expect(canvas(page)).toBeVisible();expect((await saved(page)).game).toEqual(final.game);
  await expect(page.locator('.board')).toHaveCount(0);
});
test('occupied own HQ labels the enemy occupant without exposing its type, including after resume',async({page})=>{
  const p1=defaultPlacement(1),p2=defaultPlacement(2),plane=p2.find(p=>p.type==='aircraft')!;
  const enemy=p2.map(p=>({...p,position:p.id===plane.id?'HQ-P2' as Site:p.position==='HQ-P2'?plane.position:p.position}));
  const initial=startGame(p1,enemy,2),match=advanceSavedMatch(createSavedMatch(initial,'easy',3),applyMove(initial,{from:'HQ-P2',to:'HQ-P1',lane:'C'}));
  await page.addInitScript(({key,data})=>localStorage.setItem(key,data),{key:MATCH_STORAGE_KEY,data:JSON.stringify(match)});
  await page.goto(entry);await page.getByRole('button',{name:/続きから/}).click();await expect(canvas(page)).toBeVisible();
  await expect(page.locator('.own-hq')).toHaveText('自軍本陣HQ-P1 · 敵軍 不明駒');
  await expect(page.getByRole('list',{name:'三次元表示中の駒'})).toContainText('HQ-P1 敵軍 不明');
  expect((await page.getByRole('list',{name:'三次元表示中の駒'}).locator('li').allTextContents()).filter(l=>l.includes('自軍')).every(l=>!l.includes('不明'))).toBe(true);
  await page.reload();await page.getByRole('button',{name:/続きから/}).click();await expect(page.locator('.own-hq')).toContainText('敵軍 不明駒');
});
for(const lane of ['C','D'] as const)test(`HQ aircraft drag selects physical ${lane} lane and high flight crosses intervening enemies`,async({page,isMobile})=>{
  await page.goto(entry);await page.getByText('開発用・将来の機能').click();await page.getByRole('button',{name:/開発用ローカル対局を開く/}).click();await page.getByText('検証用の盤面を開く',{exact:true}).click();await page.getByRole('button',{name:'飛行機のC/D経路'}).click();await expect(canvas(page)).toBeVisible();
  await drag(page,'HQ-P1','HQ-P2',!!isMobile,lane==='C'?-.5:.5);await expect(page.locator('.latest-event')).toContainText(`（${lane}列）`);
  await page.getByRole('button',{name:'飛行機の高飛び'}).click();await expect(canvas(page)).not.toHaveAttribute('data-battle-effect',/./);
  await drag(page,'D5','HQ-P2',!!isMobile);await expect(page.getByRole('list',{name:'三次元表示中の駒'})).toContainText('HQ-P2 自軍 飛行機');
  await expect(page.getByRole('list',{name:'三次元表示中の駒'})).toContainText('D7 敵軍 不明');
});
