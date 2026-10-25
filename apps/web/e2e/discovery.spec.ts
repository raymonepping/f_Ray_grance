import { test, expect } from '@playwright/test';
import { login, axe, noPageOverflow } from './helpers';
test('explicit preference → local indexing → explainable discovery and different direction', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await login(page, '/discover');
  const cookies = await page.context().cookies(); const csrf = cookies.find(c => c.name === '__Host-fray_csrf')!.value;
  const headers = {origin:'http://localhost:8470','x-csrf-token':csrf};
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  const anchor = catalog.items.find((f:{canonical_name:string}) => f.canonical_name === 'Phantom in Red');
  const candidate = catalog.items.find((f:{canonical_name:string}) => f.canonical_name === 'Layton');
  const rated = await page.request.post('/api/v1/collection', {headers,data:{fragranceId:anchor.id,state:'sampled',rating:5}}); expect(rated.ok()).toBe(true);
  for (const f of [anchor,candidate]) {
    await page.goto(`/fragrances/${f.id}`);
    await page.getByText('Local semantic search', {exact:true}).click();
    await page.getByRole('button',{name:'Update local text index',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Local text index updated'})).toBeVisible({timeout:20000});
  }
  await page.goto('/discover');
  const recommendations = page.getByRole('region',{name:'Explore your preferences'});
  await expect(recommendations.getByRole('link',{name:/Layton/})).toBeVisible();
  await expect(recommendations.getByText(/Text semantic relatedness:/)).toBeVisible();
  await page.getByLabel('Direction').selectOption('different');
  await expect(recommendations.getByText(/A different note direction:/)).toBeVisible();
  await noPageOverflow(page); await axe(page,'Discovery mobile');
  await page.route('**/api/v1/discover?*', route => route.fulfill({json:{items:[],engine:'structured',reason:'Ollama unavailable: structured rules remain available.'}}));
  await page.getByRole('button',{name:'Refresh suggestions'}).click();
  await expect(page.getByTestId('discovery-reason')).toContainText('Ollama unavailable');
});

test('a verified profile without a pyramid still shows its untiered listed notes (Boss Bottled Elixir)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, '/discover');
  await page.getByLabel('Brand').fill('Hugo Boss');
  await page.getByLabel('Fragrance name').fill('Boss Bottled Elixir');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/Exact match verified|Already in your library|Partly unavailable/)).toBeVisible({ timeout: 15_000 });
  if (await page.getByText('Exact match verified').isVisible()) {
    const listed = page.getByTestId('listed-notes');
    await expect(listed).toContainText('Vetiver');
    await expect(page.getByText('Scento lists these without top, heart or base tiers.')).toBeVisible();
    await expect(page.getByTestId('tier-top-unknown')).toHaveText('Not listed'); // still no invented tier
  }
});
