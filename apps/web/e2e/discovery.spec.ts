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
    // Live Scento data: the untiered list has changed over time (on 2026-10-27 it listed no notes at
    // all). The invariant is that no tier is invented; an untiered list, when Scento supplies one,
    // is shown as such. Recorded Scento responses cover the list itself in the API tests.
    await expect(page.getByTestId('tier-top-unknown')).toHaveText('Not listed'); // still no invented tier
    if (await page.getByTestId('listed-notes').count()) {
      await expect(page.getByTestId('listed-notes')).not.toBeEmpty();
      await expect(page.getByText('Scento lists these without top, heart or base tiers.')).toBeVisible();
    }
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

// Operator report 2026-10-27: "Search for …" under a barcode hint did nothing when the hint had no
// separate brand (web-search titles). Responses are intercepted; no live lookup is made.
test('the barcode hint button always searches: exact with a brand, by text without one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const lookups: unknown[] = [];
  const resolves: unknown[] = [];
  let withBrand = false;
  await page.route('**/api/v1/fragrances/lookup', async (r) => {
    const body = r.request().postDataJSON() as { query: string };
    lookups.push(body);
    const barcode = /^\d{8,14}$/.test(body.query);
    await r.fulfill({
      json: barcode
        ? {
            kind: 'barcode', query: body.query, gtin14: '03349668680757', sourceDown: false, suggestions: [],
            hint: { source: 'Web search', title: 'Some shop title', url: null, brand: withBrand ? 'Rabanne' : null, name: withBrand ? '1 Million Elixir' : 'Rabanne 1 Million Elixir Parfum Intense', query: 'Rabanne 1 Million Elixir Parfum Intense', core: '', sizeMl: null, concentration: null },
          }
        : { kind: 'text', query: body.query, sourceDown: false, suggestions: [] },
    });
  });
  await page.route('**/api/v1/fragrances/resolve', async (r) => {
    resolves.push(r.request().postDataJSON());
    await r.fulfill({ json: { state: 'not_found', reason: 'Synthetic', candidates: [] } });
  });
  await login(page, '/discover');
  const box = page.getByLabel(/Name, part of a name, brand, or barcode/);
  await box.fill('3349668680757');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('button', { name: /^Search for/ }).click();
  await expect.poll(() => lookups.length).toBe(2);
  expect(lookups[1]).toEqual({ query: 'Rabanne 1 Million Elixir Parfum Intense' }); // text search, not nothing
  await expect(box).toHaveValue('Rabanne 1 Million Elixir Parfum Intense');

  withBrand = true;
  await box.fill('3349668680757');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('button', { name: /^Search for/ }).click();
  await expect.poll(() => resolves.length).toBe(1);
  expect(resolves[0]).toMatchObject({ brand: 'Rabanne', name: '1 Million Elixir' }); // the exact search ran
});

// ADR-023: add a fragrance from a shop page when Scento cannot verify it. Responses are intercepted;
// no shop page is read and no TinyFish credit is used.
test('add from a shop page: preview, correct, confirm as "Confirmed by you"', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let confirmBody: unknown = null;
  await page.route('**/api/v1/fragrances/from-shop/preview', (r) =>
    r.fulfill({
      json: {
        available: true,
        preview: {
          id: '00000000-0000-4000-8000-0000000000aa', shop: 'ICI PARIS XL', url: 'https://www.iciparisxl.nl/rabanne/phantom-parfum/parfum/p/BP_1257290',
          brand: 'Rabanne', name: 'Phantom Parfum', concentration: 'parfum', concentrationRaw: 'Parfum',
          notes: { top: ['Bergamote', 'Citron'], heart: ['Trio De Lavande'], base: ['Gousse De Vanille', 'Vetiver'] }, pageEan: '3349668614585',
        },
      },
    }),
  );
  await page.route('**/api/v1/fragrances/from-shop/*/confirm', async (r) => {
    confirmBody = r.request().postDataJSON();
    await r.fulfill({ status: 201, json: { fragranceId: '00000000-0000-4000-8000-0000000000bb', created: true, identityStatus: 'owner_confirmed', notesSaved: true } });
  });
  await login(page, '/discover');
  const panel = page.getByTestId('shop-evidence');
  await panel.getByLabel('Product page URL').fill('https://www.iciparisxl.nl/rabanne/phantom-parfum/parfum/p/BP_1257290');
  await panel.getByRole('button', { name: 'Read page' }).click();
  await expect(panel.getByLabel('Name')).toHaveValue('Phantom Parfum');
  await expect(panel).toContainText('Bergamote, Citron');
  await expect(panel).toContainText('3349668614585');
  await panel.getByLabel('Name').fill('Phantom Parfum');
  await panel.getByRole('button', { name: 'Confirm and add' }).click();
  await expect(panel.getByRole('status')).toContainText('Added as “Confirmed by you”, with the notes from the page.');
  await expect(panel.getByRole('link', { name: /Open the fragrance/ })).toHaveAttribute('href', '/fragrances/00000000-0000-4000-8000-0000000000bb');
  expect(confirmBody).toEqual({ brand: 'Rabanne', name: 'Phantom Parfum', keepNotes: true });
  await axe(page, 'discover shop evidence');
  await noPageOverflow(page);
});
