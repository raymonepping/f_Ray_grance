import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import { request } from '@playwright/test';
import { OWNER_FILE, STATE_FILE } from './owner';

export default async function setup(): Promise<void> {
  const username = `e2e-${randomBytes(3).toString('hex')}`;
  const password = randomBytes(24).toString('base64url');
  execFileSync('bash', [path.resolve(here, '../../../scripts/owner.sh'), 'create', username, 'E2E Owner'], {
    input: `${password}\n`,
    env: { ...process.env, FRAY_OWNER_PASSWORD_STDIN: '1' },
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  writeFileSync(OWNER_FILE, JSON.stringify({ username, password }), { mode: 0o600 });
  // Sign in ONCE and reuse the session: the API rate-limits logins per client (10/min).
  const base = process.env.FRAY_E2E_BASE_URL ?? 'http://localhost:8470';
  const ctx = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  const r = await ctx.post('/api/v1/auth/login', { data: { username, password } });
  if (!r.ok()) throw new Error(`e2e login failed: ${r.status()}`);
  await ctx.storageState({ path: STATE_FILE });
  // A second explicitly named, source-verified identity for live two-way Compare.
  // Layton was verified against its live Scento profile; no near-match substitution.
  const csrf = (await ctx.storageState()).cookies.find(c => c.name === '__Host-fray_csrf')?.value;
  const enriched = await ctx.post('/api/v1/fragrances/enrich', {
    headers: { 'x-csrf-token': csrf ?? '' },
    data: { providerId: 'layton-parfums-de-marly', brand: 'Parfums de Marly', name: 'Layton' },
  });
  if (!enriched.ok()) throw new Error(`live comparison identity enrichment failed: ${enriched.status()}`);
  await ctx.dispose();
}
