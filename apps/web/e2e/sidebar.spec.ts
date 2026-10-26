// Phase 14 (ADR-015): navigation grouped by purpose with dividers on the sidebar, rail and drawer.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axe, noPageOverflow, uiLogin } from './helpers';

const evidence = path.resolve(import.meta.dirname, '../../../reports/evidence/14');
mkdirSync(evidence, { recursive: true });
const ORDER = [
  ['Your collection', ['Collection', 'Samples']],
  ['Find and compare', ['Discover', 'Compare']],
  ['Your profile', ['My DNA', 'My Spectrum']],
  ['Learn', ['Academy']],
] as const;

for (const vp of [{ tag: 'desktop', w: 1440, h: 900 }, { tag: 'rail', w: 1024, h: 800 }] as const) {
  test(`sidebar groups and dividers at ${vp.tag}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await uiLogin(page); // shell.spec signs the shared session out earlier in the run
    const sidebar = page.getByRole('complementary', { name: 'Primary' });
    for (const [group, items] of ORDER) {
      const list = sidebar.getByRole('list', { name: group });
      await expect(list.getByRole('link')).toHaveCount(items.length);
      for (const [i, label] of items.entries()) await expect(list.getByRole('link').nth(i)).toHaveAccessibleName(label);
    }
    await expect(sidebar.getByTestId('nav-divider')).toHaveCount(3);
    await expect(sidebar.getByRole('list', { name: 'Settings' }).getByRole('link', { name: 'Settings' })).toBeVisible();
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await noPageOverflow(page);
      await axe(page, `sidebar ${vp.tag} ${colorScheme}`);
      await page.screenshot({ path: path.join(evidence, `sidebar-${vp.tag}-${colorScheme}.png`) });
    }
  });
}

test('mobile drawer uses the same groups; bottom navigation keeps the four primary routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await uiLogin(page);
  const bottom = page.locator('nav[aria-label="Main"]').last();
  await expect(bottom.getByRole('link')).toHaveCount(4);
  for (const [i, l] of ['Collection', 'Discover', 'Compare', 'My DNA'].entries()) await expect(bottom.getByRole('link').nth(i)).toContainText(l);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  for (const [group, items] of [...ORDER, ['Settings', ['Settings']] as const]) {
    const list = drawer.getByRole('list', { name: group });
    await expect(list.getByRole('link')).toHaveCount(items.length);
  }
  await axe(page, 'drawer groups');
  await page.screenshot({ path: path.join(evidence, 'drawer-mobile.png') });
});
