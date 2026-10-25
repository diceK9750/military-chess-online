import type {Page} from '@playwright/test';
export async function openExtras(page:Page){const button=page.getByRole('button',{name:'保存・設定',exact:true});if(await button.count()&&await button.getAttribute('aria-expanded')!=='true')await button.click();}
export async function closeExtras(page:Page){const button=page.getByRole('button',{name:'詳細を閉じる',exact:true});if(await button.isVisible())await button.click();}
export async function openAudio(page:Page){const summary=page.locator('.audio-menu>summary');if(await summary.isVisible()&&!(await page.locator('.audio-menu').getAttribute('open')!==null))await summary.click();}
