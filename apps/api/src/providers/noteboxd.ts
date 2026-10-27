// NoteboxD client (ADR-021). Server-only; the API key is read from the file Vault Agent renders
// (/vault/rendered/noteboxd.json) on every call, so rotating the KV secret needs no restart, and an
// empty key means the source is off. Only the 1-cent search and profile endpoints are used; a local
// daily budget stays below the 50-call free tier, and the server's rate-limit headers are respected.
// The shapes below follow responses observed live on 2026-10-27 (test/fixtures/noteboxd), which
// differ from the published docs. Responses are untrusted: size-capped and reduced to plain values.
import { readFile } from 'node:fs/promises';

export type NoteboxdErrorCode = 'NOTEBOXD_DISABLED' | 'NOTEBOXD_BUDGET' | 'NOTEBOXD_RATE_LIMITED' | 'NOTEBOXD_BALANCE' | 'NOTEBOXD_UNAVAILABLE' | 'NOTEBOXD_BAD_RESPONSE';

export class NoteboxdError extends Error {
  constructor(
    readonly code: NoteboxdErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface NoteboxdHit {
  id: string;
  name: string;
  brand: string;
}

export type NoteboxdTier = 'top' | 'heart' | 'base' | null;

export interface NoteboxdProfile {
  id: string;
  name: string;
  brand: string;
  slug: string;
  concentration: string | null;
  launchYear: number | null;
  notes: { name: string; tier: NoteboxdTier }[];
}

const BASE = 'https://api.noteboxd.com/v1';
const MAX_BODY = 1024 * 1024;
const TIMEOUT_MS = 15_000;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const TIERS: Record<string, NoteboxdTier> = { TOP: 'top', HEART: 'heart', MIDDLE: 'heart', BASE: 'base' };

export class NoteboxdClient {
  private day = '';
  private used = 0;
  private serverRemaining: number | null = null;

  constructor(
    private readonly keyFile: string | null,
    private readonly dailyBudget = 40,
    private readonly http: HttpFetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when a non-empty key is rendered (cheap; used to show or hide the source). */
  async enabled(): Promise<boolean> {
    return (await this.key()) !== null;
  }

  /** Calls left today before the local budget (or the server's own count) stops further calls. */
  remaining(): number {
    this.rollDay();
    const local = Math.max(0, this.dailyBudget - this.used);
    return this.serverRemaining === null ? local : Math.min(local, this.serverRemaining);
  }

  private rollDay() {
    const d = new Date(this.now()).toISOString().slice(0, 10); // NoteboxD quotas are per UTC day
    if (d !== this.day) {
      this.day = d;
      this.used = 0;
      this.serverRemaining = null;
    }
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
    if (!key) throw new NoteboxdError('NOTEBOXD_DISABLED', 'NoteboxD is not configured (no key in Vault)');
    if (this.remaining() <= 0) throw new NoteboxdError('NOTEBOXD_BUDGET', "Today's NoteboxD allowance is used up; try again tomorrow (UTC)");
    // A strongly referenced timer: AbortSignal.timeout() was observed never firing (ADR-013).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      let res: Response;
      try {
        res = await this.http(`${BASE}${path}`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: ctrl.signal });
      } catch {
        throw new NoteboxdError('NOTEBOXD_UNAVAILABLE', ctrl.signal.aborted ? 'NoteboxD did not answer in time' : 'NoteboxD could not be reached');
      }
      // Only successful calls are billed (and count against the free tier), so only they use budget.
      const rem = Number(res.headers.get('x-ratelimit-remaining'));
      if (Number.isFinite(rem) && res.headers.get('x-ratelimit-remaining') !== null) this.serverRemaining = rem;
      if (res.status === 429) {
        this.serverRemaining = 0;
        throw new NoteboxdError('NOTEBOXD_RATE_LIMITED', 'NoteboxD daily quota reached; try again later');
      }
      if (res.status === 402) throw new NoteboxdError('NOTEBOXD_BALANCE', 'NoteboxD balance is too low for this call');
      if (res.status === 401 || res.status === 403) throw new NoteboxdError('NOTEBOXD_DISABLED', 'NoteboxD rejected the API key');
      if (res.status === 404) return null;
      if (!res.ok) throw new NoteboxdError('NOTEBOXD_UNAVAILABLE', `NoteboxD answered HTTP ${res.status}`);
      this.used += 1;
      let text: string;
      try {
        text = await res.text();
      } catch {
        throw new NoteboxdError('NOTEBOXD_UNAVAILABLE', 'NoteboxD response was cut off');
      }
      if (text.length > MAX_BODY) throw new NoteboxdError('NOTEBOXD_BAD_RESPONSE', 'NoteboxD response too large');
      try {
        return JSON.parse(text);
      } catch {
        throw new NoteboxdError('NOTEBOXD_BAD_RESPONSE', 'NoteboxD response was not JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET /v1/search (1 cent): fragrance hits, brand taken from `subtitle` as observed live. */
  async search(q: string): Promise<NoteboxdHit[]> {
    const qs = new URLSearchParams({ q: q.slice(0, 120), type: 'fragrance', limit: '10' });
    const body = (await this.get(`/search?${qs}`)) as { results?: unknown } | null;
    if (!body || !Array.isArray(body.results)) return [];
    return body.results.flatMap((r: Record<string, unknown>) => {
      const id = str(r.id, 64);
      return r.type === 'fragrance' && /^[a-z0-9-]{4,64}$/i.test(id) ? [{ id, name: str(r.name, 200), brand: str(r.subtitle, 120) }] : [];
    });
  }

  /** GET /v1/fragrances/{id} (1 cent): the fields F-Ray-grance can use, or null when not found. */
  async fragrance(id: string): Promise<NoteboxdProfile | null> {
    if (!/^[a-z0-9-]{4,64}$/i.test(id)) throw new NoteboxdError('NOTEBOXD_BAD_RESPONSE', 'Invalid NoteboxD id');
    const d = (await this.get(`/fragrances/${encodeURIComponent(id)}`)) as Record<string, unknown> | null;
    if (!d) return null;
    const brand = d.brand && typeof d.brand === 'object' ? str((d.brand as Record<string, unknown>).name, 120) : str(d.brand, 120);
    const year = typeof d.launchYear === 'number' && Number.isInteger(d.launchYear) ? d.launchYear : null;
    const notes = Array.isArray(d.notes)
      ? d.notes.slice(0, 80).flatMap((n: Record<string, unknown>) => {
          const name = str(n?.name, 80);
          return name.length >= 2 ? [{ name, tier: TIERS[str(n?.pyramid, 20).toUpperCase()] ?? null }] : [];
        })
      : [];
    return {
      id: str(d.id, 64) || id,
      name: str(d.name, 200),
      brand,
      slug: str(d.slug, 200),
      concentration: str(d.concentration, 60) || null,
      launchYear: year,
      notes,
    };
  }
}
