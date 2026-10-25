import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { OWNER_FILE, STATE_FILE, owner } from './owner';

export default function teardown(): void {
  try {
    execFileSync('podman', ['exec', '-i', 'fray-api', 'node', 'apps/api/dist/cli/owner.js', 'delete-synthetic', owner().username], { stdio: 'ignore' });
  } finally {
    rmSync(OWNER_FILE, { force: true });
    rmSync(STATE_FILE, { force: true });
  }
}
