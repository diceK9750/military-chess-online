import {expect,test} from '@playwright/test';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
const entry=process.env.BATTLEFIELD_TEST_URL??'/';
for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[430,932],[390,844]])test(`formation library and battlefield command ${width}x${height}`,async({page},info)=>{
 test.setTimeout(60000); // Full named preset CRUD, placement edits, reload and game start.
 await page.setViewportSize({width,height});await page.goto(entry);await page.getByRole('button',{name:/コンピューターと対戦/}).first().click();await page.getByRole('button',{name:/^かんたん/}).click();
 const battlefield=page.getByRole('region',{name:'三次元戦場',exact:true}),command=battlefield.getByRole('region',{name:'軍議操作',exact:true}),library=command.getByRole('region',{name:'自作陣形',exact:true});
 await battlefield.getByRole('button',{name:'陣形保存・読込へ'}).click();await expect(library.getByRole('button',{name:'現在の配置を保存'})).toBeInViewport();
 await library.getByRole('button',{name:'現在の配置を保存'}).click();await expect(library.getByLabel('自作陣形の名前')).toBeFocused();await library.getByLabel('自作陣形の名前').fill('友人テスト陣形');await library.getByRole('button',{name:'陣形を保存',exact:true}).click();
 const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('military-chess:formation-library:v1')!));expect(original[0].placements).toHaveLength(23);expect(original[0].placements.every((p:Record<string,unknown>)=>Object.keys(p).sort().join()==='site,type')).toBe(true);
 await expect(library.getByRole('status',{name:'陣形の保存状態'})).toContainText('友人テスト陣形 · 保存済み');await library.getByRole('button',{name:'お気に入り 登録'}).click();
 await library.getByRole('button',{name:'複製'}).click();await library.getByRole('button',{name:'名前変更'}).click();await library.getByLabel('自作陣形の名前').fill('複製した陣形');await library.getByRole('button',{name:'名前を変更する'}).click();await expect(library.getByRole('img',{name:'陣形プレビュー 複製した陣形'})).toBeVisible();
 await library.getByRole('button',{name:'削除',exact:true}).click();await library.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('military-chess:formation-library:v1')!).length)).toBe(2);
 await library.getByRole('button',{name:'削除',exact:true}).click();await library.getByRole('button',{name:'削除する'}).click();await library.getByLabel('保存済み陣形を選ぶ').selectOption(original[0].id);
 const candidates=original[0].placements.filter((p:{site:string})=>/[23]$/.test(p.site));const a=candidates[0],b=candidates.find((p:{type:string})=>p.type!==a.type);
 await command.getByText('自軍の駒一覧・枚数を見る').click();await command.getByRole('button',{name:a.site,exact:true}).click();await command.getByRole('button',{name:b.site,exact:true}).click();
 await expect(library.getByRole('status',{name:'陣形の保存状態'})).toContainText('未保存変更あり');await library.getByRole('button',{name:'上書き保存'}).click();await expect(library.getByRole('status',{name:'陣形の保存状態'})).toContainText('保存済み');
 await command.getByRole('button',{name:a.site,exact:true}).click();await command.getByRole('button',{name:b.site,exact:true}).click();await expect(library.getByRole('status',{name:'陣形の保存状態'})).toContainText('未保存変更あり');await library.getByRole('button',{name:'この陣形で適用'}).click();await expect(library.getByRole('status',{name:'陣形の保存状態'})).toContainText('保存済み');
 await command.getByText('自軍の駒一覧・枚数を見る').click();await library.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('formation-library.png'),fullPage:true});
 await page.reload();await page.getByRole('button',{name:/続きから/}).click();await library.getByLabel('保存済み陣形を選ぶ').selectOption(original[0].id);await library.getByRole('button',{name:'この陣形で適用'}).click();await command.getByRole('button',{name:'この配置で確定'}).click();
 await expect(page.getByRole('heading',{name:/あなたの手番|CPUの手番/})).toBeVisible();await expect(command.getByRole('button',{name:/AI参謀/})).toBeVisible();await expect(command.getByRole('button',{name:'対局を保存'})).toBeVisible();
 await page.screenshot({path:info.outputPath('game-command.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await command.getByRole('button',{name:'対局を保存'}).click();await expect(page.getByLabel('パスワード',{exact:true})).toBeVisible();
});
