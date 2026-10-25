import { describe, expect, it } from 'vitest';
import { normalizeGtin } from '../src/domain/gtin.js';
import { normalizeIdentity } from '../src/domain/identity.js';
import { loadConfig, ConfigError } from '../src/config.js';

describe('GTIN normalisation', () => {
  it.each([
    ['4006381333931', '04006381333931'], // EAN-13
    ['400638 133393-1', '04006381333931'], // spaces/dashes tolerated
    ['96385074', '00000096385074'], // EAN-8
    ['036000291452', '00036000291452'], // UPC-A
    ['00012345678905', '00012345678905'], // GTIN-14 with leading zeros kept
  ])('%s -> %s', (raw, gtin14) => {
    expect(normalizeGtin(raw)).toEqual({ ok: true, gtin14, raw });
  });
  it.each([
    ['4006381333932', 'BAD_CHECK_DIGIT'],
    ['40063813339', 'BAD_LENGTH'],
    ['40063813339X1', 'NON_NUMERIC'],
    ['', 'NON_NUMERIC'],
  ])('%s rejected: %s', (raw, reason) => {
    expect(normalizeGtin(raw)).toMatchObject({ ok: false, reason });
  });
});

describe('identity normalisation mirrors SQL and never drops words', () => {
  it('folds case, accents, punctuation', () => {
    expect(normalizeIdentity("  L'Homme  Idéal ")).toBe('l homme ideal');
    expect(normalizeIdentity('JOOP!')).toBe('joop!');
    expect(normalizeIdentity('...')).toBeNull();
  });
  it('keeps near-names distinct', () => {
    expect(normalizeIdentity('Invictus Elixir')).not.toBe(normalizeIdentity('Invictus Victory Elixir'));
    expect(normalizeIdentity('1 Million')).not.toBe(normalizeIdentity('1 Million Black'));
  });
});

describe('configuration', () => {
  it('rejects secrets passed through environment variables', () => {
    expect(() => loadConfig({ FRAY_DB_PASSWORD: 'x' })).toThrow(ConfigError);
    expect(() => loadConfig({ FRAY_SESSION_SECRET: 'x' })).toThrow(ConfigError);
  });
  it('validates ranges and origins', () => {
    expect(() => loadConfig({ FRAY_HTTP_PORT: '99999' })).toThrow(/FRAY_HTTP_PORT/);
    expect(() => loadConfig({ FRAY_PUBLIC_ORIGINS: 'javascript:alert(1)' })).toThrow(/origin/);
    expect(loadConfig({}).db.credentialsFile).toBe('/vault/rendered/db-runtime.json');
  });
});

describe('password hashing', () => {
  it('uses Argon2id PHC strings, rejects short passwords, verifies correctly', async () => {
    const { hashPassword, verifyPassword } = await import('../src/security/password.js');
    const h = await hashPassword('correct horse battery');
    // The PHC prefix proves algorithm Argon2id (constant 2 in password.ts) and parameters.
    expect(h.startsWith('$argon2id$v=19$m=65536,t=3,p=1$')).toBe(true);
    expect(await verifyPassword(h, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword(null, 'anything')).toBe(false);
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/);
  });
});
