import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import { rmSync } from 'node:fs';
import { CATALOGUE_MARK_FILE, OWNER_FILE, STATE_FILE, owner } from './owner';

export default function teardown(): void {
  try {
    // The E2E owner has append-only collection history, so use the guarded synthetic purge.
    execFileSync('bash', [path.resolve(here, '../../../scripts/purge-synthetic-owner.sh'), owner().username], { stdio: 'ignore' });
  } finally {
    try {
      // Remove the catalogue rows this run added and nothing references (ADR-017).
      execFileSync('bash', [path.resolve(here, '../../../scripts/clean-slate.sh'), '--undo', CATALOGUE_MARK_FILE], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch {
      /* reported on stderr; the run's results stand */
    }
    rmSync(CATALOGUE_MARK_FILE, { force: true });
    rmSync(OWNER_FILE, { force: true });
    rmSync(STATE_FILE, { force: true });
  }
}
