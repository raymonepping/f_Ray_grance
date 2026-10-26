// Removing a fragrance from the collection: previewed, cancellable, then permanent; the fragrance
// itself stays in the library.
import { test, expect } from '@playwright/test';
import { axe, login } from './helpers';

test('remove a collection entry: preview, cancel, then remove permanently', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const csrf = (await page.context().cookies()).find((c) => c.name === '__Host-fray_csrf')!.value;
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  const layton = catalog.items.find((x: { canonical_name: string }) => x.canonical_name === 'Layton');
  const created = await page.request.post('/api/v1/collection', {
    headers: { origin: 'http://localhost:8470', 'x-csrf-token': csrf },
    data: { fragranceId: layton.id, state: 'wishlist', clientRequestId: crypto.randomUUID() },
  });
  expect(created.ok()).toBe(true);
  const entryId = (await created.json()).entry.id;
  await page.goto(`/fragrances/${layton.id}`);
  const before = (await (await page.request.get(`/api/v1/fragrances/${layton.id}/relationship`)).json()).entries.length;
  const entries = page.getByRole('region', { name: 'Your collection' }).getByRole('article');
  const target = entries.filter({ hasText: 'Wishlist' }).last();
  await target.getByRole('button', { name: 'Remove from collection…' }).click();
  const preview = target.getByTestId('remove-preview');
  await expect(preview).toContainText('Remove Layton permanently?');
  await expect(preview).toContainText('status history');
  await axe(page, 'removal preview');
  await preview.getByRole('button', { name: 'Cancel' }).click();
  await expect(target.getByTestId('remove-preview')).toHaveCount(0);
  await target.getByRole('button', { name: 'Remove from collection…' }).click();
  await target.getByTestId('remove-preview').getByRole('button', { name: 'Remove permanently' }).click();
  await expect(page.getByText('Removed from your collection. The fragrance stays in your library.')).toBeVisible();
  const after = (await (await page.request.get(`/api/v1/fragrances/${layton.id}/relationship`)).json()).entries;
  expect(after.length).toBe(before - 1);
  expect(after.some((e: { id: string }) => e.id === entryId)).toBe(false);
  await expect(page.getByRole('heading', { level: 1, name: 'Layton' })).toBeVisible(); // still in the library
});
