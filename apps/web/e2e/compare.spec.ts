import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axe, login, noPageOverflow, trackConsole } from './helpers';
const evidence = path.resolve(import.meta.dirname, '../../../reports/evidence/07');
mkdirSync(evidence, { recursive: true });
for (const width of [320, 375, 390, 768, 1280, 1440]) {
  test(`source-aware paired comparison at ${width}px, swap, full pyramid and URL restoration`, async ({ page }) => {
    const errors = trackConsole(page); await page.setViewportSize({ width, height: 900 });
    await login(page, '/compare');
    const a = page.getByLabel('Scent A', { exact: true }); const b = page.getByLabel('Scent B', { exact: true });
    await expect(a.locator('option').filter({ hasText: 'Phantom in Red' })).toHaveCount(1);
    const aid = await a.locator('option').filter({ hasText: 'Phantom in Red' }).getAttribute('value');
    const bid = await b.locator('option').filter({ hasText: 'Layton' }).getAttribute('value');
    await a.selectOption(aid!); await b.selectOption(bid!);
    await expect(page.getByRole('region', { name: 'What differs?' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Scent A profile' })).toContainText('Phantom in Red');
    await expect(page.getByTestId('trait-sweet-0')).not.toHaveText('—');
    await page.getByLabel('Full source-listed pyramid').check();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))));
      await noPageOverflow(page); await axe(page, `Compare ${width} ${colorScheme}`);
      await page.screenshot({ path: path.join(evidence, `compare-${width}-${colorScheme}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Swap A / B' }).click();
    await expect(page.getByRole('article', { name: 'Scent A profile' })).toContainText('Layton');
    await page.reload(); await expect(page.getByRole('article', { name: 'Scent B profile' })).toContainText('Phantom in Red');
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByRole('heading', { name: 'Choose two fragrances' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('invalid deep links fail safely; duplicate identities cannot compare', async ({ page }) => {
  await login(page, '/compare?a=invalid&b=invalid');
  await expect(page.getByText('Choose two different fragrances.')).toBeVisible();
  await page.goto('/compare?a=invalid&b=00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('status').filter({ hasText: 'Select fragrances or retry' })).toBeVisible();
});
