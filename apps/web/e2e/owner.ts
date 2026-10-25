import { readFileSync } from 'node:fs';
export const OWNER_FILE = `${process.env.TMPDIR ?? '/tmp'}/fray-e2e-owner.json`;
export const owner = (): { username: string; password: string } => JSON.parse(readFileSync(OWNER_FILE, 'utf8'));
export const STATE_FILE = `${process.env.TMPDIR ?? '/tmp'}/fray-e2e-state.json`;
