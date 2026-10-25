import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { owner } from './owner';

/** Open a page as the signed-in owner (session from global setup). */
export async function login(page: Page, next = '/collection'): Promise<void> {
  await page.goto(next);
  await page.waitForURL((u) => u.pathname === next.split('?')[0]);
  await page.locator('main').waitFor();
}

/** Interactive sign-in through the form (only for tests that exercise login itself). */
export async function uiLogin(page: Page, next = '/collection'): Promise<void> {
  const { username, password } = owner();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname === next.split('?')[0]);
}

export async function noPageOverflow(page: Page): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, 'page-wide horizontal overflow').toBeLessThanOrEqual(inner);
}

export async function axe(page: Page, label: string): Promise<void> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${label}: ${v.id} — ${v.help} (${v.nodes.length}): ${v.nodes.map(n => `${n.target.join(', ')}: ${n.failureSummary}`).join('; ')}`)).toEqual([]);
}

export function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
