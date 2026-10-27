// Phase 15 (review R6, R7): My Spectrum keeps only the current scope's result, and plotted ticks are
// operable, grouped when positions coincide. Spectrum responses are synthetic and intercepted;
// fragrance IDs are real catalogue identities, so the detail pages they open are real.
import { test, expect, type Cookie, type Page, type Route } from '@playwright/test';
import { axe, noPageOverflow, trackConsole, uiLogin } from './helpers';

type Item = { id: string; name: string; brand: string; position: number };

function axis(code: string, label: string, left: string, right: string, items: Item[], total: number) {
  const ps = items.map((i) => i.position);
  return {
    code,
    label,
    left: { label: left, traits: [left.toLowerCase()] },
    right: { label: right, traits: [right.toLowerCase()] },
    position: items.length ? ps.reduce((a, b) => a + b, 0) / items.length : null,
    spread: items.length ? { min: Math.min(...ps), max: Math.max(...ps) } : null,
    placed: items.length,
    total,
    fragrances: items,
    notPlaced: [],
  };
}

function payload(scope: string, items: Item[], dry: Item[] = []) {
  return {
    scope,
    method: 'spectrum-v1',
    traitMethod: 'sourced-notes-v1',
    total: items.length,
    axes: [axis('fresh_warm', 'Fresh ↔ Warm', 'Fresh', 'Warm', items, items.length), axis('dry_sweet', 'Dry ↔ Sweet', 'Dry', 'Sweet', dry, items.length)],
    traits: [],
    families: [],
    unknownFamily: 0,
    limitation: 'Synthetic spectrum for a browser regression.',
  };
}

async function catalogue(page: Page): Promise<Record<string, Item>> {
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  const pick = (n: string, position: number): Item => {
    const f = catalog.items.find((x: { canonical_name: string }) => x.canonical_name === n);
    expect(f, `catalogue has ${n}`).toBeTruthy();
    return { id: f.id, name: f.canonical_name, brand: f.brand_name ?? f.brand ?? 'Brand', position };
  };
  return { phantom: pick('Phantom in Red', -0.1), layton: pick('Layton', -0.1) };
}

// One interactive sign-in for the whole file (shell.spec signs the shared session out, and the
// sign-in rate limit is a security control the suite must not exhaust).
let cookies: Cookie[] = [];
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await uiLogin(await ctx.newPage());
  cookies = (await ctx.storageState()).cookies;
  await ctx.close();
});
test.beforeEach(async ({ page }) => page.context().addCookies(cookies));

const readout = (page: Page) => page.getByLabel('Spectrum readout').locator('dd').first();
const scopeOf = (r: Route) => new URL(r.request().url()).searchParams.get('scope') ?? 'owned';

test.describe('R6: only the selected scope may update the page', () => {
  test('a slow sample-inclusive response cannot overwrite a newer owned-only result', async ({ page }) => {
    const errors = trackConsole(page);
    const c = await catalogue(page);
    await page.route('**/api/v1/profile/spectrum**', async (r) => {
      const s = scopeOf(r);
      await new Promise((ok) => setTimeout(ok, s === 'owned_and_samples' ? 700 : 30));
      await r.fulfill({ json: s === 'owned' ? payload('owned', [c.phantom!]) : payload(s, [c.phantom!, c.layton!]) }).catch(() => {});
    });
    await page.goto('/spectrum');
    await expect(readout(page)).toHaveText('01');
    await page.getByRole('button', { name: 'Owned and samples' }).click();
    await page.getByRole('button', { name: 'Owned', exact: true }).click();
    await page.waitForTimeout(1000); // past the slow response
    await expect(page.getByRole('button', { name: 'Owned', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(readout(page)).toHaveText('01');
    await page.getByTestId('axis-fresh_warm').getByTestId('axis-details').locator('summary').click();
    await expect(page.getByRole('list', { name: 'Fresh ↔ Warm: your fragrances' }).getByRole('listitem')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a late failure for a scope already left shows no error; rapid toggles end on the last choice', async ({ page }) => {
    const c = await catalogue(page);
    let failSamples = true;
    await page.route('**/api/v1/profile/spectrum**', async (r) => {
      const s = scopeOf(r);
      if (s === 'owned_and_samples' && failSamples) {
        await new Promise((ok) => setTimeout(ok, 600));
        await r.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'Synthetic late failure' } } }).catch(() => {});
        return;
      }
      await new Promise((ok) => setTimeout(ok, s === 'owned' ? 400 : 30));
      await r.fulfill({ json: s === 'owned' ? payload('owned', [c.phantom!]) : payload(s, [c.phantom!, c.layton!]) }).catch(() => {});
    });
    await page.goto('/spectrum');
    await expect(readout(page)).toHaveText('01');
    await page.getByRole('button', { name: 'Owned and samples' }).click();
    await page.getByRole('button', { name: 'Owned', exact: true }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Spectrum unavailable')).toHaveCount(0);
    await expect(readout(page)).toHaveText('01');

    // Rapid toggles: owned answers slowly, samples quickly; the final choice (samples) must win.
    failSamples = false;
    for (const name of ['Owned and samples', 'Owned', 'Owned and samples', 'Owned', 'Owned and samples']) {
      await page.getByRole('button', { name, exact: true }).click();
    }
    await page.waitForTimeout(900);
    await expect(page.getByRole('button', { name: 'Owned and samples' })).toHaveAttribute('aria-pressed', 'true');
    await expect(readout(page)).toHaveText('02');
  });

  test('leaving the page while a request is pending applies nothing and logs no error', async ({ page }) => {
    const errors = trackConsole(page);
    const c = await catalogue(page);
    await page.route('**/api/v1/profile/spectrum**', async (r) => {
      await new Promise((ok) => setTimeout(ok, scopeOf(r) === 'owned' ? 30 : 800));
      await r.fulfill({ json: payload(scopeOf(r), [c.phantom!]) }).catch(() => {});
    });
    await page.goto('/spectrum');
    await expect(readout(page)).toHaveText('01');
    await page.getByRole('button', { name: 'Owned and samples' }).click();
    await page.getByRole('complementary', { name: 'Primary' }).getByRole('link', { name: 'Collection' }).first().click();
    await expect(page).toHaveURL(/\/collection/);
    await page.waitForTimeout(1100);
    expect(errors).toEqual([]);
  });
});

for (const vp of [{ tag: 'desktop', w: 1440, h: 900 }, { tag: '320', w: 320, h: 720 }] as const) {
  test.describe(`R7: plotted ticks at ${vp.tag}`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width: vp.w, height: vp.h }));

    test('one placed fragrance: qualified marker, tick opens its detail by pointer', async ({ page }) => {
        const c = await catalogue(page);
      await page.route('**/api/v1/profile/spectrum**', (r) => r.fulfill({ json: payload(scopeOf(r), [c.phantom!]) }));
      await page.goto('/spectrum');
      const fw = page.getByTestId('axis-fresh_warm');
      await expect(fw.getByTestId('axis-reading')).toContainText('based on one fragrance');
      // Zero placed on the other axis: honest, and nothing plotted.
      const ds = page.getByTestId('axis-dry_sweet');
      await expect(ds.getByTestId('axis-reading')).toContainText('Not enough known traits');
      await expect(ds.getByTestId('axis-reading')).not.toContainText('based on one fragrance');
      await expect(ds.getByTestId('axis-ticks').getByRole('link')).toHaveCount(0);
      await fw.getByTestId('axis-ticks').getByRole('link', { name: /^Phantom in Red, .*Open details$/ }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Phantom in Red' })).toBeVisible();
    });

    test('several and equal positions: a group opens a list; keyboard and pointer reach every detail', async ({ page }) => {
        const c = await catalogue(page);
      const apart = { ...c.layton!, position: 0.6 };
      await page.route('**/api/v1/profile/spectrum**', (r) => r.fulfill({ json: payload(scopeOf(r), [c.phantom!, c.layton!], [c.phantom!, apart]) }));
      await page.goto('/spectrum');
      const fw = page.getByTestId('axis-fresh_warm').getByTestId('axis-ticks');
      // Equal positions share one control.
      await expect(fw.getByRole('link')).toHaveCount(0);
      const group = fw.getByRole('button', { name: /^2 fragrances close together/ });
      await expect(group).toHaveAttribute('aria-expanded', 'false');
      // Several distinct positions get their own ticks.
      await expect(page.getByTestId('axis-dry_sweet').getByTestId('axis-ticks').getByRole('link')).toHaveCount(2);

      // Keyboard: open, close with Escape (focus returns), reopen and follow a link.
      await group.focus();
      await page.keyboard.press('Enter');
      await expect(group).toHaveAttribute('aria-expanded', 'true');
      const list = fw.getByRole('list', { name: /^Fragrances near/ });
      await expect(list.getByRole('link')).toHaveCount(2);
      for (const colorScheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await noPageOverflow(page);
        await axe(page, `spectrum ticks ${vp.tag} ${colorScheme} (group open)`);
      }
      await page.keyboard.press('Escape');
      await expect(group).toHaveAttribute('aria-expanded', 'false');
      await expect(group).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await expect(list.getByRole('link').first()).toBeFocused();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Phantom in Red|Layton/);
      const first = await page.getByRole('heading', { level: 1 }).textContent();

      // Pointer: the other member of the group is reachable too.
      await page.goBack();
      await group.click();
      await list.getByRole('link', { name: first?.includes('Layton') ? /Phantom in Red/ : /Layton/ }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(first?.includes('Layton') ? 'Phantom in Red' : 'Layton');
    });
  });
}
