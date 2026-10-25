// Argon2id password hashing (spec/SECURITY.md §3). Parameters exceed the OWASP
// minimum (m=19 MiB, t=2, p=1). Only PHC strings are stored.
import { hash, verify } from '@node-rs/argon2';

// Algorithm.Argon2id === 2 (const enum; not importable under verbatimModuleSyntax). Asserted in tests.
const ARGON2ID = 2;
const PARAMS = { algorithm: ARGON2ID, memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (password.length > 1024) throw new Error('password too long');
  return hash(password, PARAMS);
}

// Verifying against a fixed dummy hash keeps unknown-user logins as slow as real ones.
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hash('fray-dummy-password-for-timing', PARAMS));

export async function verifyPassword(phc: string | null, password: string): Promise<boolean> {
  if (password.length > 1024) return false;
  if (!phc) {
    await verify(await dummyHash(), password).catch(() => false);
    return false;
  }
  return verify(phc, password).catch(() => false);
}
