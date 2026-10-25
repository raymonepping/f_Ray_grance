// Session-token HMAC key delivered by Vault Agent ({"token_hmac_key": "...", "version": n}).
// Stored session digests are HMAC-SHA256(key, token): a database leak alone cannot be
// replayed into a valid cookie lookup. Rotating the key invalidates all sessions.
import { createHmac } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

export class SessionKey {
  private key: Buffer | null = null;
  private mtimeMs = -1;
  version: number | null = null;

  constructor(private readonly file: string) {}

  private load(): void {
    const st = statSync(this.file);
    if (st.mtimeMs === this.mtimeMs && this.key) return;
    const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { token_hmac_key?: unknown; version?: unknown };
    if (typeof parsed.token_hmac_key !== 'string' || parsed.token_hmac_key.length < 32) {
      throw new Error('session key file must contain token_hmac_key (>= 32 chars)');
    }
    this.key = Buffer.from(parsed.token_hmac_key, 'utf8');
    this.version = typeof parsed.version === 'number' ? parsed.version : null;
    this.mtimeMs = st.mtimeMs;
  }

  digest(value: string): Buffer {
    this.load();
    return createHmac('sha256', this.key!).update(value).digest();
  }

  get ready(): boolean {
    try {
      this.load();
      return true;
    } catch {
      return false;
    }
  }
}
