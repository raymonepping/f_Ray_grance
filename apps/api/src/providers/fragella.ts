// Fragella client (ADR-022), the last-resort source: the free plan allows 20 calls per month.
// Server-only; the key is read from the file Vault Agent renders (/vault/rendered/fragella.json) on
// every call, and an empty key means the source is off. Before each paid call the free /usage
// endpoint is read and the call is refused at or below the reserve; errors are never retried. One
// search returns full profiles, so a check costs one call. Shapes follow a response recorded live
// on 2026-10-27 (test/fixtures/fragella). Responses are untrusted: size-capped, reduced to values.
import { readFile } from 'node:fs/promises';
import type { GapProfile, GapTier } from '../domain/gap-sources.js';

export type FragellaErrorCode = 'FRAGELLA_DISABLED' | 'FRAGELLA_RESERVE' | 'FRAGELLA_QUOTA' | 'FRAGELLA_BALANCE' | 'FRAGELLA_UNAVAILABLE' | 'FRAGELLA_BAD_RESPONSE';

export class FragellaError extends Error {
  constructor(
    readonly code: FragellaErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface FragellaUsage {
  remaining: number;
  limit: number;
  periodEnd: string | null;
}

const BASE = 'https://api.fragella.com/api/v1';
const MAX_BODY = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const USAGE_TTL_MS = 60_000;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const names = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.slice(0, 60).map((n) => str(typeof n === 'string' ? n : (n as { name?: unknown })?.name, 80)).filter((n) => n.length >= 2))] : [];

export class FragellaClient {
  private usageCache: { at: number; value: FragellaUsage } | null = null;

  constructor(
    private readonly keyFile: string | null,
    private readonly reserve = 2,
    private readonly http: HttpFetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async enabled(): Promise<boolean> {
    return (await this.key()) !== null;
  }

  private async key(): Promise<string | null> {
    if (!this.keyFile) return null;
    try {
      const k = (JSON.parse(await readFile(this.keyFile, 'utf8')) as { api_key?: unknown }).api_key;
      return typeof k === 'string' && /^[\x21-\x7e]{8,512}$/.test(k) ? k : null;
    } catch {
      return null;
    }
  }

  private async get(path: string): Promise<unknown> {
    const key = await this.key();
    if (!key) throw new FragellaError('FRAGELLA_DISABLED', 'Fragella is not configured (no key in Vault)');
    // A strongly referenced timer: AbortSignal.timeout() was observed never firing (ADR-013).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      let res: Response;
      try {
        res = await this.http(`${BASE}${path}`, { headers: { 'x-api-key': key, accept: 'application/json' }, signal: ctrl.signal });
      } catch {
        throw new FragellaError('FRAGELLA_UNAVAILABLE', ctrl.signal.aborted ? 'Fragella did not answer in time' : 'Fragella could not be reached');
      }
      if (res.status === 429) throw new FragellaError('FRAGELLA_QUOTA', "Fragella's monthly quota is used up");
      if (res.status === 402) throw new FragellaError('FRAGELLA_BALANCE', 'Fragella requires payment for further calls');
      if (res.status === 401 || res.status === 403) throw new FragellaError('FRAGELLA_DISABLED', 'Fragella rejected the API key');
      if (res.status === 404) return null;
      if (!res.ok) throw new FragellaError('FRAGELLA_UNAVAILABLE', `Fragella answered HTTP ${res.status}`);
      let text: string;
      try {
        text = await res.text();
      } catch {
        throw new FragellaError('FRAGELLA_UNAVAILABLE', 'Fragella response was cut off');
      }
      if (text.length > MAX_BODY) throw new FragellaError('FRAGELLA_BAD_RESPONSE', 'Fragella response too large');
      try {
        return JSON.parse(text);
      } catch {
        throw new FragellaError('FRAGELLA_BAD_RESPONSE', 'Fragella response was not JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET /usage: free (not counted by Fragella). Cached for a minute. */
  async usage(fresh = false): Promise<FragellaUsage> {
    if (!fresh && this.usageCache && this.now() - this.usageCache.at < USAGE_TTL_MS) return this.usageCache.value;
    const d = (await this.get('/usage')) as { limit?: { total_effective_limit?: unknown }; usage?: { requests_remaining?: unknown }; billing_period?: { end?: unknown } } | null;
    const remaining = Number(d?.usage?.requests_remaining);
    if (!d || !Number.isFinite(remaining)) throw new FragellaError('FRAGELLA_BAD_RESPONSE', 'Fragella usage could not be read');
    const value = { remaining, limit: Number(d.limit?.total_effective_limit) || 0, periodEnd: str(d.billing_period?.end, 40) || null };
    this.usageCache = { at: this.now(), value };
    return value;
  }

  /** Calls that may still be spent this month (remaining minus the reserve). */
  async spendable(): Promise<number> {
    return Math.max(0, (await this.usage()).remaining - this.reserve);
  }

  /** GET /fragrances?search= (one monthly call): full profiles, only after the free usage check. */
  async search(q: string): Promise<GapProfile[]> {
    const u = await this.usage(true);
    if (u.remaining <= this.reserve) {
      throw new FragellaError('FRAGELLA_RESERVE', `Fragella has ${u.remaining} of ${u.limit} monthly calls left; the last ${this.reserve} are kept in reserve`);
    }
    const qs = new URLSearchParams({ search: q.slice(0, 120), limit: '10' });
    const body = await this.get(`/fragrances?${qs}`);
    this.usageCache = null; // the count changed
    const rows = Array.isArray(body) ? body : body && Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : [];
    return rows.slice(0, 10).flatMap((r) => {
      const d = r as Record<string, unknown>;
      const id = str(d._id, 160);
      const name = str(d.Name, 200);
      if (!id || !name) return [];
      const n = (d.Notes ?? {}) as Record<string, unknown>;
      const tiered = ([['Top', 'top'], ['Middle', 'heart'], ['Base', 'base']] as const).flatMap(([k, t]) => names(n[k]).map((name) => ({ name, tier: t as GapTier })));
      const year = /^\d{4}$/.test(str(d.Year, 8)) ? Number(str(d.Year, 8)) : null;
      return [{ id, name, brand: str(d.Brand, 120), pageUrl: 'https://api.fragella.com', concentration: str(d.OilType, 60) || null, launchYear: year, notes: tiered, generalNotes: names(d['General Notes']) }];
    });
  }
}
