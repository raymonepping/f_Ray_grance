// Scent Academy browser journeys (Phase 11): navigation, Explain this, lesson resume,
// Train My Nose stop/resume, the honest no-tutor state, keyboard and both themes.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { axe, login, noPageOverflow, trackConsole } from './helpers';

const evidence = path.resolve(import.meta.dirname, '../../../reports/evidence/11');
mkdirSync(evidence, { recursive: true });

async function themes(page: Page, label: string) {
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await noPageOverflow(page);
    await axe(page, `${label} ${colorScheme}`);
    await page.screenshot({ path: path.join(evidence, `${label.replaceAll(' ', '-')}-${colorScheme}.png`), fullPage: true });
  }
}

async function resetLesson(page: Page, slug: string) {
  const csrf = (await page.context().cookies()).find((c) => c.name === '__Host-fray_csrf')!.value;
  const r = await page.request.patch(`/api/v1/academy/lessons/${slug}/progress`, {
    headers: { origin: 'http://localhost:8470', 'x-csrf-token': csrf },
    data: { status: 'not_started', position: 0, contentVersion: 1 },
  });
  expect(r.ok()).toBe(true);
}

for (const vp of [{ tag: 'desktop', w: 1440, h: 900 }, { tag: 'mobile', w: 390, h: 844 }] as const) {
  test(`learning journey at ${vp.tag}: nav, lesson resume, completion, no-tutor state`, async ({ page }) => {
    const errors = trackConsole(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await login(page);
    await resetLesson(page, 'pyramid-drydown');
    if (vp.tag === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /Academy/ }).click();
    } else {
      await page.getByRole('complementary', { name: 'Primary' }).getByRole('link', { name: 'Academy' }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Scent Academy' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Lessons' }).getByRole('listitem')).toHaveCount(6);
    await themes(page, `academy ${vp.tag}`);

    await page.getByRole('link', { name: /The note pyramid & drydown/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The note pyramid & drydown' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'An evolving impression' })).toBeVisible();
    await page.getByRole('button', { name: 'Next section' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'A list is a reference' })).toBeVisible();
    await expect(page.getByTestId('lesson-status')).toHaveText('In progress');

    // Resume: a reload returns to the saved section.
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'A list is a reference' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark lesson complete' }).click();
    await expect(page.getByTestId('lesson-status')).toContainText('Completed');

    // No generative model is configured: honest status plus curated text, no fake answer.
    await page.getByLabel('Your question about this lesson').fill('Why can a base note show up early?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    const tutor = page.getByTestId('tutor-result');
    await expect(tutor).toContainText(/No local generative model configured|Local tutor unavailable|Configured model/);
    await expect(tutor).toContainText('No answer was generated');
    await expect(tutor).toContainText('Top, heart and base describe');
    await themes(page, `lesson ${vp.tag}`);
    expect(errors).toEqual([]);
  });
}

test('Explain this links fragrance detail and Compare to the matching lesson; glossary works by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const catalog = await (await page.request.get('/api/v1/fragrances?limit=100')).json();
  const phantom = catalog.items.find((f: { canonical_name: string }) => f.canonical_name === 'Phantom in Red');
  await page.goto(`/fragrances/${phantom.id}`);
  await page.getByRole('link', { name: 'Explain this: the note pyramid and drydown' }).click();
  await expect(page).toHaveURL(/\/academy\/lessons\/pyramid-drydown$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The note pyramid & drydown' })).toBeVisible();
  await page.goto(`/fragrances/${phantom.id}`);
  await page.getByRole('link', { name: 'Explain this: scent descriptors' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Build a sensory vocabulary' })).toBeVisible();

  await page.goto('/academy/glossary');
  await page.getByLabel('Filter terms').fill('sillage');
  await expect(page.getByText('The trail left as someone moves.')).toBeVisible();
  const lesson = page.getByRole('link', { name: 'Lesson for sillage' });
  await lesson.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Concentration, projection & sillage' })).toBeVisible();
});

test('Train My Nose: generic exercise, save, pause (read-only), resume after reload, complete', async ({ page }) => {
  const errors = trackConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, '/academy/practice');
  await page.getByLabel('Name').fill('E2E blotter');
  await page.getByRole('button', { name: 'Start exercise' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E blotter' })).toBeVisible();
  const opening = page.getByRole('form', { name: 'Opening observation' });
  await opening.getByLabel('Descriptors').fill('bright, peppery');
  await opening.getByLabel(/What you notice/).fill('Sharp citrus first, then something dry.');
  await opening.getByRole('button', { name: 'Save observation' }).click();
  await expect(opening.getByRole('status')).toHaveText('Observation saved.');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('exercise-status')).toHaveText('Paused');
  await expect(opening.getByLabel('Descriptors')).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('exercise-status')).toHaveText('Paused');
  await expect(page.getByRole('form', { name: 'Opening observation' }).getByLabel('Descriptors')).toHaveValue('bright, peppery');
  await page.getByRole('button', { name: 'Resume' }).click();
  const twenty = page.getByRole('form', { name: 'About 20 minutes observation' });
  await twenty.getByLabel('Elapsed minutes').fill('25');
  await twenty.getByLabel('Descriptors').fill('softer, woody');
  await twenty.getByRole('button', { name: 'Save observation' }).click();
  await expect(twenty.getByRole('status')).toHaveText('Observation saved.');
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByTestId('exercise-status')).toHaveText('Completed');
  await themes(page, 'practice mobile');
  await page.goto('/academy/practice');
  await expect(page.getByRole('list', { name: 'Practice exercises' })).toContainText('E2E blotter');
  expect(errors).toEqual([]);
});

test('bounded live educational lookup: one public term, attributed or honestly unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, '/academy/notes');
  await page.getByLabel('Material or note').fill('Lavender');
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/academy/reference')),
    page.getByRole('button', { name: 'Look up' }).click(),
  ]);
  const body = await resp.json();
  // Only the public term goes out: the request carries kind + term and nothing else.
  expect(new URL(resp.url()).searchParams.toString()).toBe('kind=material&term=Lavender');
  if (body.available) {
    await expect(page.getByRole('article', { name: /^Reference:/ })).toContainText('Scento');
    expect(body.reference.sourceUrl ?? 'https://www.scento.com/').toMatch(/^https:\/\/www\.scento\.com\//);
  } else {
    await expect(page.getByText('Reference unavailable')).toBeVisible();
  }
  writeFileSync(path.join(evidence, 'live-lookup.json'), JSON.stringify({
    observedAt: new Date().toISOString(), kind: 'material', term: 'Lavender', available: body.available,
    ...(body.available ? { folio: body.reference.folio, title: body.reference.title, sourceUrl: body.reference.sourceUrl, attribution: body.reference.attribution, facts: body.reference.facts.length, related: body.reference.related.length } : { code: body.code }),
  }, null, 2));
});
