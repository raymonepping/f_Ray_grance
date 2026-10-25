// Phase 06 collection flows on a phone-sized viewport, against the live stack.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { axe, login, noPageOverflow } from './helpers';

const here = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.resolve(here, '../../../reports/evidence/06');
mkdirSync(EVIDENCE, { recursive: true });

test.use({ viewport: { width: 390, height: 844 } });

async function openPhantom(page: Page): Promise<void> {
  await login(page, '/discover');
  await page.getByLabel('Brand').fill('Rabanne');
  await page.getByLabel('Fragrance name').fill('Phantom in Red');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: /Open details|Saved — open details/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Phantom in Red' })).toBeVisible();
}

test.describe.serial('sample → owned → history, with server-acknowledged edits', () => {
  test('add as a sample; it appears under Samples, not Owned', async ({ page }) => {
    await openPhantom(page);
    const rel = page.getByRole('region', { name: 'Your collection' });
    await expect(rel.getByText('Not in your collection yet.')).toBeVisible();
    await rel.getByLabel('Add to collection as').selectOption('sampled');
    await rel.getByLabel(/Note for the history/).fill('Tester from the department store');
    await rel.getByRole('button', { name: 'Add to collection' }).click();
    await expect(rel.getByRole('status').filter({ hasText: 'Added as Sample.' })).toBeVisible();
    await page.goto('/collection?state=sampled');
    await expect(page.getByRole('link', { name: /Phantom in Red/ })).toBeVisible();
    await page.goto('/collection?state=owned');
    await expect(page.getByText(/No owned yet/)).toBeVisible();
    await noPageOverflow(page);
  });

  test('promote the sample to owned; history keeps both steps with the reason', async ({ page }) => {
    await openPhantom(page);
    const entry = page.getByRole('article', { name: 'Collection entry 1' });
    await entry.getByLabel(/Private note/).fill('Unsaved draft while changing status');
    await entry.locator('label', { hasText: /^\s*Owned/ }).click();
    await entry.getByLabel(/Why\?/).fill('bought a full bottle');
    await entry.getByRole('button', { name: 'Change to Owned' }).click();
    await expect(entry.getByRole('status').filter({ hasText: 'Saved: now Owned.' })).toBeVisible();
    await expect(entry.getByLabel(/Private note/)).toHaveValue('Unsaved draft while changing status');
    await entry.getByText(/^History \(2\)/).click();
    const history = entry.getByRole('list', { name: 'Status history' });
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(history).toContainText('Sample → Owned');
    await expect(history).toContainText('“bought a full bottle”');
    await axe(page, 'detail with collection entry (mobile)');
    await page.screenshot({ path: path.join(EVIDENCE, 'detail-entry-390.png'), fullPage: true });
  });

  test('rating and private note save only on server acknowledgement and survive reload', async ({ page }) => {
    await openPhantom(page);
    const entry = page.getByRole('article', { name: 'Collection entry 1' });
    await entry.locator('label', { hasText: /^\s*4\s*out of 5\s*$/ }).click();
    await entry.getByLabel(/Private note/).fill('Evening scent; better in autumn.');
    await entry.getByRole('button', { name: 'Save' }).click();
    await expect(entry.getByRole('status').filter({ hasText: /^Saved\.$/ })).toBeVisible();
    await page.reload();
    const after = page.getByRole('article', { name: 'Collection entry 1' });
    await expect(after.getByLabel(/Private note/)).toHaveValue('Evening scent; better in autumn.');
    await expect(after.locator('label', { hasText: /^\s*4\s*out of 5\s*$/ })).toHaveClass(/border-gold/);
  });

  test('a failed save never claims success and keeps the typed draft', async ({ page }) => {
    await openPhantom(page);
    await page.route('**/api/v1/collection/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Database temporarily unavailable', requestId: 'test' } }) })
        : route.continue(),
    );
    const entry = page.getByRole('article', { name: 'Collection entry 1' });
    await entry.getByLabel(/Private note/).fill('Draft that must not be lost');
    await entry.getByRole('button', { name: 'Save' }).click();
    await expect(entry.getByRole('status').filter({ hasText: /Not saved/ })).toBeVisible();
    await expect(entry.getByText(/^Saved\.$/)).toHaveCount(0);
    await expect(entry.getByLabel(/Private note/)).toHaveValue('Draft that must not be lost');
    await page.unroute('**/api/v1/collection/*');
    await entry.getByRole('button', { name: 'Save' }).click(); // retry succeeds
    await expect(entry.getByRole('status').filter({ hasText: /^Saved\.$/ })).toBeVisible();
  });

  test('search the collection; record a confirmed barcode; mark previously owned', async ({ page }) => {
    await login(page, '/collection');
    await page.getByLabel('Search your collection').fill('phantom');
    await expect(page.getByRole('link', { name: /Phantom in Red/ })).toBeVisible();
    await page.getByLabel('Search your collection').fill('nothing-like-this');
    await expect(page.getByText('No matches')).toBeVisible();
    await openPhantom(page);
    await page.getByText(/^Sizes & barcodes/).click();
    await page.getByLabel('Barcode (EAN/GTIN)').fill('4006381333932');
    await page.getByRole('button', { name: 'Add size' }).click();
    await expect(page.getByText('That barcode has an invalid check digit.')).toBeVisible();
    await page.getByLabel('Size (ml)').fill('100');
    await page.getByLabel('Barcode (EAN/GTIN)').fill('');
    const savedVariant = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/variants') && r.status() === 201);
    await page.getByRole('button', { name: 'Add size' }).click();
    const variant = await (await savedVariant).json() as { id: string };
    await expect(page.getByText(/100 ml/).first()).toBeVisible();
    // Remove only the size record just created by this test (never a linked package).
    const { execFileSync } = await import('node:child_process');
    if (!/^[0-9a-f-]{36}$/.test(variant.id)) throw new Error('invalid variant id');
    execFileSync('podman', ['exec', '-i', 'fray-postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'fray'], {
      input: `DELETE FROM app.product_variants WHERE id='${variant.id}' AND verification_state='unverified' AND gtin14 IS NULL AND NOT EXISTS (SELECT 1 FROM app.collection_entries WHERE variant_id='${variant.id}');`,
      stdio: ['pipe', 'ignore', 'inherit'],
    });
    const entry = page.getByRole('article', { name: 'Collection entry 1' });
    await entry.locator('label', { hasText: /^\s*Previously owned/ }).click();
    await entry.getByRole('button', { name: 'Change to Previously owned' }).click();
    await expect(entry.getByRole('status').filter({ hasText: 'Saved: now Previously owned.' })).toBeVisible();
    await page.goto('/collection?state=previously_owned');
    await expect(page.getByRole('link', { name: /Phantom in Red/ })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, 'collection-previously-owned-390.png') });
    await axe(page, 'collection filtered (mobile)');
  });
});
