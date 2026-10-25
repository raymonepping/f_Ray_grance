// Design review captures (impeccable finish): seeds two real verified identities into the
// synthetic owner's collection, then screenshots key screens in both themes at desktop and
// mobile widths. Also asserts no page overflow and axe-clean in each capture.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axe, login, noPageOverflow } from './helpers';

const out = path.resolve(import.meta.dirname, '../.impeccable/review');
mkdirSync(out, { recursive: true });

async function seed(page: Page) {
  await login(page);
  const csrf = (await page.context().cookies()).find((c) => c.name === '__Host-fray_csrf')!.value;
  const headers = { origin: 'http://localhost:8470', 'x-csrf-token': csrf };
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  const ids: Record<string, string> = {};
  for (const [name, state] of [['Phantom in Red', 'owned'], ['Layton', 'sampled']] as const) {
    const f = catalog.items.find((x: { canonical_name: string }) => x.canonical_name === name);
    expect(f, name).toBeTruthy();
    ids[name] = f.id;
    const mine = await (await page.request.get(`/api/v1/fragrances/${f.id}/relationship`)).json();
    if (!mine.entries.length) expect((await page.request.post('/api/v1/collection', { headers, data: { fragranceId: f.id, state } })).ok()).toBe(true);
  }
  return ids;
}

async function capture(page: Page, name: string) {
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    await page.waitForTimeout(150);
    await noPageOverflow(page);
    await axe(page, `${name} ${scheme}`);
    await page.screenshot({ path: path.join(out, `${name}-${scheme}.png`), fullPage: true });
  }
}

for (const vp of [{ tag: 'desktop', w: 1440, h: 900 }, { tag: 'mobile', w: 390, h: 844 }] as const) {
  test(`design review captures at ${vp.tag}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const ids = await seed(page);
    await page.goto('/collection');
    await expect(page.getByRole('list', { name: 'Collection entries' })).toBeVisible();
    await capture(page, `${vp.tag}-collection`);
    await page.goto(`/fragrances/${ids['Phantom in Red']}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Phantom in Red' })).toBeVisible();
    await capture(page, `${vp.tag}-detail`);
    await page.goto(`/compare?a=${ids['Phantom in Red']}&b=${ids['Layton']}`);
    await expect(page.getByRole('region', { name: 'What differs?' })).toBeVisible();
    await capture(page, `${vp.tag}-compare`);
    for (const route of ['/discover', '/dna', '/settings', '/academy']) {
      await page.goto(route);
      await page.locator('main h1').first().waitFor();
      await capture(page, `${vp.tag}-${route.slice(1)}`);
    }
  });
}

test('design review: sign-in screen', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await capture(page, 'desktop-login');
  await ctx.close();
});
