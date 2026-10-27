// Current Spectrum, real API and authentication; temporary owner, no mocked responses.
import { chromium, request, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../..');
const base = 'http://localhost:8470';
const temporary = mkdtempSync(path.join(tmpdir(), 'fray-article02-'));
const mark = path.join(temporary, 'catalogue.json');
const username = `probe-${randomBytes(3).toString('hex')}`;
const password = randomBytes(24).toString('base64url');
const run = (args, options = {}) => execFileSync('bash', args, {
  cwd: root, stdio: ['pipe', 'ignore', 'inherit'], ...options,
});
let marked = false;
let owner = false;
let api;
let browser;
try {
  // These modes only mark/undo temporary catalogue additions; never run clean-slate itself.
  run(['scripts/clean-slate.sh', '--mark', mark]);
  marked = true;
  owner = true; // Also attempt cleanup if account creation fails partway through.
  run(['scripts/owner.sh', 'create', username, 'Demo Collector'], {
    input: `${password}\n`, env: { ...process.env, FRAY_OWNER_PASSWORD_STDIN: '1' },
  });
  api = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  const login = await api.post('/api/v1/auth/login', { data: { username, password } });
  if (!login.ok()) throw new Error(`Login failed: ${login.status()}`);
  const storageState = await api.storageState();
  const csrf = storageState.cookies.find(c => c.name === '__Host-fray_csrf')?.value;
  const headers = { 'x-csrf-token': csrf ?? '' };
  const list = async () => {
    const response = await api.get('/api/v1/fragrances?limit=100');
    if (!response.ok()) throw new Error(`Catalogue failed: ${response.status()}`);
    return (await response.json()).items;
  };
  const findLayton = rows => rows.find(f => f.canonical_name === 'Layton' && f.brand === 'Parfums de Marly' && f.identity_status === 'verified');
  let fragrance = findLayton(await list());
  if (!fragrance) {
    const enriched = await api.post('/api/v1/fragrances/enrich', { headers, data: {
      providerId: 'layton-parfums-de-marly', brand: 'Parfums de Marly', name: 'Layton',
    } });
    if (!enriched.ok()) throw new Error(`Exact identity enrichment failed: ${enriched.status()}`);
    fragrance = findLayton(await list());
  }
  if (!fragrance) throw new Error('Verified Layton identity unavailable');
  const seeded = await api.post('/api/v1/collection', { headers, data: {
    fragranceId: fragrance.id, state: 'owned', rating: 4,
  } });
  if (!seeded.ok()) throw new Error(`Demo entry failed: ${seeded.status()}`);
  browser = await chromium.launch();
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 },
    colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}/spectrum`);
  const axis = page.getByTestId('axis-fresh_warm');
  await expect(axis).toContainText('based on one fragrance');
  const tick = axis.getByTestId('axis-ticks').getByRole('link').first();
  await expect(tick).toHaveAttribute('href', `/fragrances/${fragrance.id}`);
  await page.evaluate(() => document.fonts.ready);
  const filename = 'spectrum-desktop.png';
  await page.screenshot({ path: path.join(out, filename), fullPage: true, animations: 'disabled' });
  await tick.click();
  await expect(page).toHaveURL(`${base}/fragrances/${fragrance.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Layton', exact: true })).toBeVisible();
  const bytes = readFileSync(path.join(out, filename));
  writeFileSync(path.join(out, 'spectrum-capture.json'), JSON.stringify({
    applicationCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    capturedAt: new Date().toISOString(), filename, route: '/spectrum',
    method: 'Playwright Chromium; real API and authentication; no mocked responses or retouching',
    persona: 'Temporary synthetic owner with one owned Layton; owner purged after capture',
    viewport: { width: 1440, height: 900 }, theme: 'dark', reducedMotion: true, fullPage: true,
    verified: ['Single-fragrance qualification visible', 'Plotted tick opens the correct fragrance detail'],
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  }, null, 2) + '\n');
  console.log('Captured current Spectrum and verified its tick link.');
} finally {
  try { await browser?.close(); } finally {
    try { await api?.dispose(); } finally {
      try { if (owner) run(['scripts/purge-synthetic-owner.sh', username]); } finally {
        try { if (marked) run(['scripts/clean-slate.sh', '--undo', mark]); } finally {
          rmSync(temporary, { recursive: true, force: true });
        }
      }
    }
  }
}
