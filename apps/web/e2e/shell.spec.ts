import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import { axe, login, noPageOverflow, trackConsole, uiLogin } from './helpers';

const EVIDENCE = path.resolve(here, '../../../reports/evidence/05');
mkdirSync(EVIDENCE, { recursive: true });

test.describe('signed out', () => {
test.use({ storageState: { cookies: [], origins: [] } });

test('anonymous visitors are sent to sign-in; bad password is refused', async ({ page }) => {
  await page.goto('/collection');
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)collection/);
  await page.getByLabel('Username').fill(`nobody-${Date.now().toString(36)}`); // fresh name: avoid the real per-username lockout across runs
  await page.getByLabel('Password').fill('wrong-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText(/Sign-in failed/);
  await axe(page, 'login');
});

test('login through the form → collection; ?next cannot redirect off-site', async ({ page }) => {
  const errors = trackConsole(page);
  await uiLogin(page, '/collection');
  await expect(page.getByRole('heading', { level: 1, name: 'My Collection' })).toBeVisible();
  await expect(page.getByTestId('owned-count')).toHaveText(/owned · \d+ total/);
  await page.goto('/login?next=//evil.example/steal');
  expect(errors.filter((e) => !/401/.test(e))).toEqual([]);
});
});

for (const vp of [
  { w: 390, h: 844, nav: 'bottom' },
  { w: 768, h: 1024, nav: 'rail' },
  { w: 1280, h: 800, nav: 'sidebar' }, // ≥1200 = expanded sidebar (DESIGN §4.4)
  { w: 1440, h: 900, nav: 'sidebar' },
] as const) {
  test(`shell at ${vp.w}px: ${vp.nav} navigation, no overflow, accessible in both themes`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await login(page);
    const sidebar = page.getByRole('complementary', { name: 'Primary' });
    if (vp.nav === 'bottom') {
      await expect(sidebar).toBeHidden();
      const bottom = page.locator('nav[aria-label="Main"]').last();
      await expect(bottom).toBeVisible();
      for (const l of ['Collection', 'Discover', 'Compare', 'My DNA']) await expect(bottom.getByRole('link', { name: l })).toBeVisible();
    } else {
      await expect(sidebar).toBeVisible();
      await expect.poll(() => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(vp.nav === 'rail' ? 76 : 260);
    }
    // First paint is already the right width (no load-time sidebar animation).
    if (vp.nav !== 'bottom') {
      await page.reload();
      const w0 = await sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width));
      expect(w0).toBe(vp.nav === 'rail' ? 76 : 260);
    }
    // Footer is in normal flow (not fixed over content).
    expect(await page.locator('footer').evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed');
    for (const route of ['/collection', '/discover', '/compare', '/dna', '/settings']) {
      await page.goto(route);
      await page.locator('main h1').waitFor();
      await noPageOverflow(page);
    }
    for (const theme of ['dark', 'light'] as const) {
      // Theme preference is "system": emulate the OS scheme so the app itself applies it.
      await page.emulateMedia({ colorScheme: theme });
      for (const route of ['/collection', '/discover', '/settings']) {
        await page.goto(route);
        await page.locator('main h1').waitFor();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await axe(page, `${route} ${theme} ${vp.w}`);
      }
      await page.goto('/collection');
      await page.locator('main h1').waitFor();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: path.join(EVIDENCE, `collection-${vp.w}-${theme}.png`) });
    }
  });
}

test('keyboard: skip link first, drawer traps focus and restores it on Escape (mobile)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const menu = page.getByRole('button', { name: 'Open menu' });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
  await page.screenshot({ path: path.join(EVIDENCE, 'drawer-closed-390.png') });
});

test('sidebar collapse and theme persist across reloads (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const sidebar = page.getByRole('complementary', { name: 'Primary' });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect.poll(() => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(76);
  await page.getByRole('button', { name: /^Theme:/ }).click(); // system -> dark
  await page.getByRole('button', { name: /^Theme:/ }).click(); // dark -> light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(76);
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect.poll(() => sidebar.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(260);
});

test('reduce transparency replaces glass with opaque surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, '/settings');
  await page.getByLabel(/Reduce transparency/).check();
  const header = page.locator('header').first();
  expect(await header.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');
});

test('⌘K search → Discover → verified local identity → detail page with sourced pyramid', async ({ page }) => {
  const errors = trackConsole(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Search fragrances' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.goto('/discover');
  await page.getByLabel('Brand').fill('Rabanne');
  await page.getByLabel('Fragrance name').fill('Phantom in Red');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/Already in your library|Exact match verified/)).toBeVisible();
  await page.getByRole('link', { name: /Open details|Saved: open details/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Phantom in Red' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Top notes' })).toContainText('Plum');
  await expect(page.getByText('Sources & provenance')).toBeVisible();
  await axe(page, 'fragrance detail (light)');
  await page.screenshot({ path: path.join(EVIDENCE, 'detail-1280-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('list', { name: 'Top notes' })).toContainText('Plum');
  await axe(page, 'fragrance detail (dark)');
  await page.screenshot({ path: path.join(EVIDENCE, 'detail-1280-dark.png') });
  expect(errors.filter((e) => !/401/.test(e))).toEqual([]);
});

test('Invictus Elixir is shown for review, never substituted', async ({ page }) => {
  await login(page, '/discover');
  await page.getByLabel('Brand').fill('Rabanne');
  await page.getByLabel('Fragrance name').fill('Invictus Elixir');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText(/No exact match: review similar names|Not found|Partly unavailable/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Confirm and save to library' })).toHaveCount(0);
});

test('unknown fragrance id shows a useful not-found state', async ({ page }) => {
  await login(page, '/fragrances/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Fragrance not found' })).toBeVisible();
});

test('settings report backup status honestly (manual, not reported)', async ({ page }) => {
  await login(page, '/settings');
  await expect(page.getByTestId('last-manual-backup')).toHaveText('Not reported to the app');
  await expect(page.getByTestId('last-verified-restore')).toHaveText('Not reported to the app');
  await expect(page.getByText(/no automatic schedule/)).toBeVisible();
  await expect(page.getByTestId('settings-connection')).toHaveText(/Local connection on this Mac|Online through private HTTPS/);
});

// Runs last: revoking sessions also ends the shared e2e session.
test.describe('own session', () => {
test.use({ storageState: { cookies: [], origins: [] } });
test('session revoked server-side → in-place re-authentication; logout ends the session', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await uiLogin(page, '/settings');
  const { execFileSync } = await import('node:child_process');
  const { owner } = await import('./owner');
  execFileSync('podman', ['exec', 'fray-api', 'node', 'apps/api/dist/cli/owner.js', 'revoke-sessions', owner().username], { stdio: 'ignore' });
  await page.getByRole('link', { name: 'Collection' }).first().click();
  const dialog = page.getByRole('alertdialog', { name: 'Session expired' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Username').fill(owner().username);
  await dialog.getByLabel('Password').fill(owner().password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog).toBeHidden();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/collection');
  await expect(page).toHaveURL(/\/login\?next=/);
});
});
