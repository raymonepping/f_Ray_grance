// Perfume images (Phase 12) against the live stack: missing-image resilience, owner upload and primary
// selection, honest disabled remote sources, durable failure records, and rendering in collection,
// detail, Compare and Academy practice on desktop and mobile. Synthetic images only.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { axe, login, noPageOverflow, trackConsole } from './helpers';

const evidence = path.resolve(import.meta.dirname, '../../../reports/evidence/12');
mkdirSync(evidence, { recursive: true });

/** Minimal solid-colour RGB PNG (synthetic test image, generated in memory). */
function png(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).fill(Buffer.from([r, g, b]))]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function headers(page: Page) {
  const csrf = (await page.context().cookies()).find((c) => c.name === '__Host-fray_csrf')!.value;
  return { origin: 'http://localhost:8470', 'x-csrf-token': csrf };
}

async function seed(page: Page) {
  await login(page);
  const h = await headers(page);
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  const ids: Record<string, string> = {};
  for (const [name, state] of [['Phantom in Red', 'owned'], ['Layton', 'sampled']] as const) {
    const f = catalog.items.find((x: { canonical_name: string }) => x.canonical_name === name);
    ids[name] = f.id;
    const rel = await (await page.request.get(`/api/v1/fragrances/${f.id}/relationship`)).json();
    if (!rel.entries.length) expect((await page.request.post('/api/v1/collection', { headers: h, data: { fragranceId: f.id, state } })).ok()).toBe(true);
  }
  return ids;
}

async function themes(page: Page, label: string) {
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await noPageOverflow(page);
    await axe(page, `${label} ${colorScheme}`);
    await page.screenshot({ path: path.join(evidence, `${label.replaceAll(' ', '-')}-${colorScheme}.png`), fullPage: true });
  }
}

const loaded = (page: Page, scope = page.locator('body')) =>
  expect.poll(() => scope.locator('[data-testid="fragrance-image"] img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0).catch(() => false)).toBe(true);

test.describe.configure({ mode: 'serial' });

test('without images every surface shows the placeholder, never a broken image', async ({ page }) => {
  const errors = trackConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const ids = await seed(page);
  await page.goto('/collection');
  const rows = page.getByRole('list', { name: 'Collection entries' });
  await expect(rows.locator('[data-testid="fragrance-image"]').first()).toBeVisible();
  await expect(rows.locator('[data-testid="fragrance-image"] img')).toHaveCount(0);
  await page.goto(`/fragrances/${ids['Phantom in Red']}`);
  await expect(page.getByText('No verified image yet').first()).toBeVisible();
  await page.goto(`/compare?a=${ids['Phantom in Red']}&b=${ids['Layton']}`);
  await expect(page.getByRole('article', { name: 'Scent A profile' }).locator('[data-testid="fragrance-image"]')).toBeVisible();
  await themes(page, 'compare-no-images desktop');
  expect(errors).toEqual([]);
});

test('owner upload becomes primary, stays primary, renders everywhere; sources and failures are honest', async ({ page }) => {
  const errors = trackConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const ids = await seed(page);
  const h = await headers(page);
  const phantom = ids['Phantom in Red']!;

  await page.goto(`/fragrances/${phantom}`);
  const manager = page.getByTestId('image-manager');
  await manager.locator('summary').click();
  // The chain is reported truthfully: Scento documents no image field, remote hosts are not configured.
  await expect(manager).toContainText('documents no image field');
  await expect(manager).toContainText('No approved hosts are configured');
  await expect(manager.getByRole('heading', { name: 'Attach from an approved host' })).toHaveCount(0);

  await manager.getByLabel(/Image file/).setInputFiles({ name: 'bottle.png', mimeType: 'image/png', buffer: png(480, 600, [150, 30, 50]) });
  await manager.getByLabel('Attribution').fill('Synthetic test photo');
  await manager.getByRole('button', { name: 'Upload image' }).click();
  await expect(manager.getByRole('status')).toHaveText('Image added.');
  await expect(manager.getByTestId('primary-badge')).toHaveText('Primary (your choice)');
  await loaded(page, page.locator('section[aria-labelledby="frag-title"]'));

  // A second upload without "make primary" never replaces the owner's choice.
  await manager.getByLabel('Attribution').fill('Second photo');
  await manager.getByLabel('Make this the primary image').uncheck();
  await manager.getByLabel(/Image file/).setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: png(400, 500, [20, 80, 140]) });
  await manager.getByRole('button', { name: 'Upload image' }).click();
  await expect(manager.getByRole('status')).toHaveText('Image added.');
  const list = await (await page.request.get(`/api/v1/fragrances/${phantom}/images`)).json();
  const first = list.images.find((i: { attribution: string }) => i.attribution === 'Synthetic test photo');
  expect(list.primaryId).toBe(first.id);

  // HTML posing as an image and disabled remote sources leave durable diagnostics, nothing stored.
  const html = await page.request.post(`/api/v1/fragrances/${phantom}/images/upload`, { headers: { ...h, 'content-type': 'image/png' }, data: Buffer.from('<!doctype html><html>nope</html>') });
  expect(html.status()).toBe(400);
  expect((await html.json()).error.details.failureCode).toBe('NOT_AN_IMAGE');
  for (const kind of ['approved_remote', 'manual_external']) {
    const r = await page.request.post(`/api/v1/fragrances/${phantom}/images/remote`, { headers: h, data: { kind, url: 'https://169.254.169.254/latest/meta-data', attribution: 'x' } });
    expect((await r.json()).error.details.failureCode).toBe('SOURCE_DISABLED');
  }
  await page.reload();
  await page.getByTestId('image-manager').locator('summary').click();
  await expect(page.getByTestId('image-manager').getByText('Rejected')).toBeVisible();
  await expect(page.getByTestId('image-manager').getByText('Failed').first()).toBeVisible();

  // Images are owner-only: no session, no image.
  const anon = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await anon.request.get(`http://localhost:8470/api/v1/images/${first.id}/display`)).status()).toBe(401);
  await anon.close();

  // Rendered in collection, Compare and Academy practice.
  await page.goto('/collection');
  await loaded(page, page.getByRole('list', { name: 'Collection entries' }));
  await themes(page, 'collection-images desktop');
  await page.goto(`/compare?a=${phantom}&b=${ids['Layton']}`);
  await loaded(page, page.getByRole('article', { name: 'Scent A profile' }));
  await expect(page.getByRole('article', { name: 'Scent B profile' }).locator('[data-testid="fragrance-image"] img')).toHaveCount(0);
  await themes(page, 'compare-images desktop');
  let entry = (await (await page.request.get(`/api/v1/fragrances/${phantom}/relationship`)).json()).entries.find((e: { state: string }) => e.state === 'owned' || e.state === 'sampled');
  if (!entry) entry = (await (await page.request.post('/api/v1/collection', { headers: h, data: { fragranceId: phantom, state: 'sampled' } })).json()).entry;
  expect((await page.request.post('/api/v1/academy/practice', { headers: h, data: { entryId: entry.id, title: 'Image practice' } })).status()).toBe(201);
  await page.goto('/academy/practice');
  await loaded(page, page.getByRole('list', { name: 'Practice exercises' }));
  await page.goto(`/fragrances/${phantom}`);
  await loaded(page, page.locator('section[aria-labelledby="frag-title"]'));
  await themes(page, 'detail-images desktop');

  // Owner switches primary, then removes it; the remaining upload takes over by precedence.
  await page.getByTestId('image-manager').locator('summary').click();
  const second = page.getByTestId('image-manager').getByRole('listitem').filter({ hasText: 'Second photo' }).first();
  await second.getByRole('button', { name: 'Set as primary' }).click();
  await expect(page.getByTestId('image-manager').getByRole('status')).toHaveText('Primary image set.');
  const firstItem = page.getByTestId('image-manager').getByRole('listitem').filter({ hasText: 'Synthetic test photo' });
  await firstItem.getByRole('button', { name: 'Remove' }).click();
  await firstItem.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByTestId('image-manager').getByRole('status')).toHaveText('Image removed.');
  expect(errors).toEqual([]);
});

test('images render on mobile without overflow in collection, detail and Compare', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ids = await seed(page);
  await page.goto('/collection');
  await loaded(page, page.getByRole('list', { name: 'Collection entries' }));
  await themes(page, 'collection-images mobile');
  await page.goto(`/fragrances/${ids['Phantom in Red']}`);
  await loaded(page, page.locator('section[aria-labelledby="frag-title"]'));
  await themes(page, 'detail-images mobile');
  await page.goto(`/compare?a=${ids['Phantom in Red']}&b=${ids['Layton']}`);
  await loaded(page, page.getByRole('article', { name: 'Scent A profile' }));
  await themes(page, 'compare-images mobile');
});
