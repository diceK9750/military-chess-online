import { expect, test } from '@playwright/test';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
const entry=process.env.BATTLEFIELD_TEST_URL??'/';
for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[430,932],[390,844]])test(`formation library and battlefield command ${width}x${height}`,async({page},info)=>{
  await page.setViewportSize({width,height});await page.goto(entry);await page.getByRole('button',{name:/コンピューターと対戦/}).first().click();await page.getByRole('button',{name:/^かんたん/}).click();
  const battlefield=page.getByRole('region',{name:'三次元戦場',exact:true}),command=battlefield.getByRole('region',{name:'軍議操作',exact:true});
  await expect(command).toBeVisible();await command.getByText(/自作陣形を保存・管理/).click();await command.getByLabel('自作陣形の名前').fill('友人テスト陣形');await command.getByRole('button',{name:'新規保存'}).click();
  const library=await page.evaluate(()=>JSON.parse(localStorage.getItem('military-chess:formation-library:v1')!));expect(library[0].placements).toHaveLength(23);expect(library[0].placements.every((p:Record<string,unknown>)=>Object.keys(p).sort().join()==='site,type')).toBe(true);
  await command.getByRole('button',{name:'お気に入り 登録'}).click();await page.screenshot({path:info.outputPath('formation-library.png'),fullPage:true});
  await page.reload();await page.getByRole('button',{name:/続きから/}).click();await command.getByText(/自作陣形を保存・管理/).click();await command.getByLabel('自作陣形',{exact:true}).selectOption(library[0].id);await command.getByRole('button',{name:'陣形を読み込む'}).click();
  await command.getByText(/自作陣形を保存・管理/).click();await command.getByRole('button',{name:'この配置で確定'}).click();
  await expect(page.getByRole('heading',{name:/あなたの手番|CPUの手番/})).toBeVisible();await expect(command.getByRole('button',{name:/AI参謀/})).toBeVisible();await expect(command.getByRole('button',{name:'対局を保存'})).toBeVisible();
  await page.screenshot({path:info.outputPath('game-command.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await command.getByRole('button',{name:'対局を保存'}).click();await expect(page.getByLabel('パスワード',{exact:true})).toBeVisible();
});
