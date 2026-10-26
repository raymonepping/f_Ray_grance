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
  await expect(recommendations.getByText(/Text semantic relatedness:/).first()).toBeVisible();
  await page.getByLabel('Direction').selectOption('different');
  await expect(recommendations.getByText(/A different note direction:/).first()).toBeVisible();
  await noPageOverflow(page); await axe(page,'Discovery mobile');
  await page.route('**/api/v1/discover?*', route => route.fulfill({json:{items:[],engine:'structured',reason:'Ollama unavailable: structured rules remain available.'}}));
  await page.getByRole('button',{name:'Refresh suggestions'}).click();
  await expect(page.getByTestId('discovery-reason')).toContainText('Ollama unavailable');
});

test('a verified profile without a pyramid still shows its untiered listed notes (Boss Bottled Elixir)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, '/discover');
  await page.getByLabel('Brand', { exact: true }).fill('Hugo Boss');
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

test('quick find: an EAN shows what the barcode is, and a brand-page listing (CK One) still verifies exactly', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, '/discover');
  await page.getByLabel(/Name, part of a name, brand, or barcode/).fill('3616303473396');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  const hint = page.getByTestId('barcode-hint');
  await expect(hint).toContainText('Ck One Essence', { timeout: 20_000 });
  await expect(hint).toContainText(/Open Beauty Facts|Web search/); // live source; web search is the honest fallback
  await expect(page.getByText('matches the barcode')).toHaveCount(0); // "CK One" is not "CK One Essence"
  await page.getByLabel(/Name, part of a name, brand, or barcode/).fill('ck one');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  const list = page.getByRole('list', { name: 'Suggestions' });
  await list.getByRole('listitem').filter({ hasText: /^CK One\s+Calvin Klein/ }).getByRole('button', { name: 'Check this one' }).click();
  await expect(page.getByText(/Exact match verified|Already in your library/)).toBeVisible({ timeout: 20_000 });
});

test('detail offers web research and image lookups without running them automatically', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  const f = catalog.items.find((x: { canonical_name: string }) => x.canonical_name === 'Phantom in Red');
  await page.goto(`/fragrances/${f.id}`);
  const research = page.getByTestId('research-panel');
  await expect(research).toContainText('Web research');
  await expect(research.getByRole('button', { name: /Research missing details|Researching/ }).or(research.getByText(/Off: no TinyFish key/))).toBeVisible();
  const images = page.getByTestId('image-manager');
  await images.locator('summary').click();
  await expect(images.getByRole('heading', { name: 'Find an image' })).toBeVisible();
  await images.getByLabel('Barcode from your bottle or box').fill('4006381333931');
  await images.getByRole('button', { name: 'Look up', exact: true }).click();
  await expect(images.getByText(/Not in Open Beauty Facts|Open Beauty Facts (could not be reached|answered HTTP)/)).toBeVisible({ timeout: 20_000 });
});
