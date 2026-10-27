// My Spectrum (Phase 13): empty state, populated spectrum on desktop and mobile in both themes,
// coverage and readings stated, links to fragrance detail. Synthetic owner; real verified identities.
import { test, expect, type Cookie, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axe, noPageOverflow, trackConsole, uiLogin } from './helpers';

const evidence = path.resolve(import.meta.dirname, '../../../reports/evidence/13');
mkdirSync(evidence, { recursive: true });

// shell.spec signs the shared session out, so this file signs in once and reuses that session:
// the sign-in rate limit is a security control the suite must not exhaust.
let cookies: Cookie[] = [];
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await uiLogin(await ctx.newPage());
  cookies = (await ctx.storageState()).cookies;
  await ctx.close();
});
test.beforeEach(async ({ page }) => page.context().addCookies(cookies));

async function own(page: Page, names: string[]) {
  await page.goto('/collection');
  const csrf = (await page.context().cookies()).find((c) => c.name === '__Host-fray_csrf')!.value;
  const headers = { origin: 'http://localhost:8470', 'x-csrf-token': csrf };
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  for (const n of names) {
    const f = catalog.items.find((x: { canonical_name: string }) => x.canonical_name === n);
    const rel = await (await page.request.get(`/api/v1/fragrances/${f.id}/relationship`)).json();
    if (!rel.entries.some((e: { state: string }) => e.state === 'owned')) {
      expect((await page.request.post('/api/v1/collection', { headers, data: { fragranceId: f.id, state: 'owned' } })).ok()).toBe(true);
    }
  }
}

test('empty collection shows an honest empty state', async ({ page }) => {
  await page.route('**/api/v1/profile/spectrum**', (r) =>
    r.fulfill({ json: { scope: 'owned', method: 'spectrum-v1', traitMethod: 'sourced-notes-v1', total: 0, axes: [], traits: [], families: [], unknownFamily: 0, limitation: '' } }),
  );
  await page.goto('/spectrum');
  await expect(page.getByRole('heading', { name: 'No owned fragrances yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Go to Collection/ })).toBeVisible();
});

for (const vp of [{ tag: 'desktop', w: 1440, h: 900 }, { tag: 'mobile', w: 390, h: 844 }] as const) {
  test(`spectrum of owned fragrances at ${vp.tag}: axes, coverage, readings, both themes`, async ({ page }) => {
    const errors = trackConsole(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await own(page, ['Phantom in Red', 'Layton']);
    if (vp.tag === 'desktop') {
      await page.getByRole('complementary', { name: 'Primary' }).getByRole('link', { name: 'My Spectrum' }).click();
    } else {
      await page.goto('/spectrum');
    }
    await expect(page.getByRole('heading', { level: 1, name: 'My Spectrum' })).toBeVisible();
    for (const code of ['fresh_warm', 'dry_sweet']) {
      const axis = page.getByTestId(`axis-${code}`);
      await expect(axis.getByTestId('axis-coverage')).toHaveText(/^\d+\/\d+ placed$/);
      await expect(axis.getByTestId('axis-reading')).toHaveText(/Balanced|Leans|Clearly|Not enough known traits/);
    }
    await expect(page.getByText(/not a statement of what you like/)).toBeVisible();
    const fwDetails = page.getByTestId('axis-fresh_warm').getByTestId('axis-details');
    await expect(fwDetails).toHaveJSProperty('open', false); // folded by default
    await fwDetails.locator('summary').click();
    await expect(page.getByRole('list', { name: 'Fresh ↔ Warm: your fragrances' })).toContainText('Phantom in Red');
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await noPageOverflow(page);
      await axe(page, `spectrum ${vp.tag} ${colorScheme}`);
      await page.screenshot({ path: path.join(evidence, `spectrum-${vp.tag}-${colorScheme}.png`), fullPage: true });
    }
    // Scope switch includes samples; ticks link to fragrance detail.
    await page.getByRole('button', { name: 'Owned and samples' }).click();
    await expect(page.getByRole('button', { name: 'Owned and samples' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('axis-fresh_warm').getByTestId('axis-details').locator('summary').click(); // the scope switch reloads the axes
    await page.getByRole('list', { name: 'Fresh ↔ Warm: your fragrances' }).getByRole('link', { name: /Phantom in Red/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Phantom in Red' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
