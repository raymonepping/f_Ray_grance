import { test,expect } from '@playwright/test';
import { login,axe,noPageOverflow } from './helpers';
test('four seasonal choices survive reload; portable export previews safely and live import remains gated',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page,'/dna');
 for(const season of ['spring','summer','autumn','winter']){
  await page.getByRole('button',{name:season,exact:true}).click();
  await expect(page.getByRole('heading',{name:`${season} preferences`,exact:true})).toBeVisible();
  await page.getByLabel('Note, family, accord or trait').fill(season==='winter'?'Vanilla':'Bergamot');
  await page.getByLabel('Your preference',{exact:true}).selectOption(season==='autumn'?'neutral':'love');
  await page.getByRole('button',{name:'Add choice',exact:true}).click();
  await page.getByLabel('Private seasonal note').fill(`Synthetic ${season} preferences`);
  await page.getByRole('button',{name:'Save this season'}).click();
  await expect(page.getByRole('status').filter({hasText:`Saved ${season} preferences.`})).toBeVisible();
 }
 await page.reload();await page.getByRole('button',{name:'autumn',exact:true}).click();
 await expect(page.getByLabel('notes: Bergamot',{exact:true})).toHaveValue('neutral');
 await expect(page.getByLabel('Private seasonal note')).toHaveValue('Synthetic autumn preferences');
 await noPageOverflow(page);await axe(page,'My DNA mobile');
 await page.goto('/settings');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export my collection'}).click();const download=await pending;
 const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));const data=Buffer.concat(chunks);
 const bundle=JSON.parse(data.toString('utf8'));expect(bundle.version).toBe(1);expect(bundle.seasons).toHaveLength(4);expect(bundle.events.length).toBeGreaterThan(0);expect(bundle).not.toHaveProperty('sessions');
 await page.getByLabel('Preview a JSON export').setInputFiles({name:'synthetic-export.json',mimeType:'application/json',buffer:data});
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByRole('heading',{name:'Import preview'})).toBeVisible();
 await page.getByLabel('I reviewed this file and the current-owner target.').check();
 await page.getByRole('button',{name:'Apply reviewed import'}).click();
 await expect(page.getByRole('status').filter({hasText:'Import remains disabled until independently verified recovery is recorded.'})).toBeVisible();
 await noPageOverflow(page);await axe(page,'Portability mobile');
});
