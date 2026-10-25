import {expect,test,type Locator} from '@playwright/test';
test.use({hasTouch:true,launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
const entry=process.env.BATTLEFIELD_TEST_URL??'/';
for(const [width,height,left,right,top,bottom] of [[844,390,44,44,0,21],[844,390,44,0,0,21],[568,320,44,44,0,21],[320,568,0,0,44,34]])test(`safe area and continuous picker ${width}x${height} insets ${left}/${right}/${top}/${bottom}`,async({page},info)=>{
 await page.setViewportSize({width,height});const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{left,right,top,bottom}});await page.goto(entry);await page.getByRole('button',{name:/コンピューターと対戦/}).first().click();await page.getByRole('button',{name:/^かんたん/}).click();await expect(page.locator('canvas')).toBeVisible();
 const safe=async(locator:Locator)=>{const r=(await locator.boundingBox())!;expect(r.x).toBeGreaterThanOrEqual(left-.5);expect(r.x+r.width).toBeLessThanOrEqual(width-right+.5);expect(r.y).toBeGreaterThanOrEqual(top-.5);expect(r.y+r.height).toBeLessThanOrEqual(height-bottom+.5);};
 const hit=async(locator:Locator)=>expect(await locator.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--battle-safe-left').trim())).toBe(`${left}px`);
 await safe(page.locator('.app-shell>header .brand'));await safe(page.locator('.audio-menu>summary'));await safe(page.locator('.battlefield-stage'));
 if(left)expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('app-shell'),{x:left/2,y:150})).toBe(true);
 if(right)expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.classList.contains('app-shell'),{x:width-right/2,y:150})).toBe(true);
 for(const b of await page.locator('.battlefield-cameras button,.mobile-primary-row>button').all()){await safe(b);await hit(b);}
 const audio=page.locator('.audio-menu>summary');await audio.tap();await safe(page.locator('.audio-menu .audio-controls'));await audio.tap();await page.screenshot({path:info.outputPath('safe-setup.png')});
 await page.getByRole('button',{name:'駒一覧',exact:true}).tap();const dialog=page.getByRole('dialog');await safe(dialog);const close=dialog.getByRole('button',{name:'一覧を閉じる'});await safe(close);await hit(close);
 await dialog.getByRole('region',{name:'名前から駒を選ぶ'}).getByRole('button').first().tap();await expect(dialog).toBeVisible();const targets=dialog.getByRole('region',{name:'選択駒の合法地点'});await expect(targets).toBeFocused();const destination=targets.getByRole('button').first();await expect(destination).toBeInViewport();await safe(destination);await hit(destination);await page.screenshot({path:info.outputPath('safe-destinations.png')});await destination.tap();await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'この配置で確定',exact:true}).tap();await safe(page.getByRole('button',{name:'確定して実行',exact:true}));await page.screenshot({path:info.outputPath('safe-play.png')});await cdp.detach();
});
