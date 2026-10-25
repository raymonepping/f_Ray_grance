// Scento Perfume API adapter (spec/DATA_SOURCES.md §2, §4). Documented read-only GET
// endpoints only: /search and /perfumes/{slug}. Bounded and polite: timeout, retry
// with backoff for idempotent GETs, token-bucket rate limit, modest TTL cache for
// user-initiated lookups. Only the search text leaves the system — never owner ids,
// ratings or personal notes. Payloads are validated; nothing raw reaches clients.
import { createHash } from 'node:crypto';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { educationalSlug, normalizeFolio, type EducationalFolio, type EducationalKind } from './scento-folio.js';

export type { EducationalFolio, EducationalKind } from './scento-folio.js';

export type SourceErrorCode =
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_RATE_LIMITED'
  | 'SOURCE_SCHEMA_CHANGED'
  | 'SOURCE_TERMS_BLOCK'
  | 'NOT_FOUND';

export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

const Nullable = <T extends Parameters<typeof Type.Union>[0][number]>(t: T) => Type.Union([t, Type.Null()]);
const Notes = Nullable(Type.Array(Type.String()));

const SearchSchema = Type.Object({
  detail: Type.Object({
    query: Type.String(),
    total: Type.Integer(),
    matches: Type.Array(
      Type.Object({
        kind: Type.String(),
        name: Type.String(),
        house: Type.String(),
        family: Nullable(Type.String()),
        page: Type.String(),
      }),
    ),
  }),
  cite: Type.String(),
});

const ProfileSchema = Type.Object({
  detail: Type.Object({
    name: Type.String(),
    house: Type.String(),
    year: Nullable(Type.Integer()),
    perfumer: Nullable(Type.Union([Type.String(), Type.Array(Type.String())])),
    concentration: Nullable(Type.String()),
    family: Nullable(Type.String()),
    subfamily: Nullable(Type.String()),
    pyramid: Nullable(Type.Object({ top: Notes, heart: Notes, base: Notes })),
    notes: Notes,
    character: Nullable(Type.String()),
    character_words: Nullable(Type.Array(Type.String())),
    wears: Nullable(
      Type.Object({ seasons: Nullable(Type.Array(Type.String())), hours: Nullable(Type.Array(Type.String())) }),
    ),
    signature_materials: Nullable(Type.Array(Type.String())),
  }),
  scento_page: Type.Object({ label: Type.String(), url: Type.String() }),
  cite: Type.String(),
});

export interface SearchCandidate {
  providerId: string | null; // slug from /perfumes/{slug} page URL; null when the link is not a perfume page
  name: string;
  house: string;
  family: string | null;
  sourceUrl: string;
}

export interface SourceProfile {
  providerId: string;
  name: string;
  house: string;
  year: number | null;
  concentrationRaw: string | null;
  family: string | null;
  subfamily: string | null;
  pyramid: { top: string[] | null; heart: string[] | null; base: string[] | null };
  character: string | null;
  characterWords: string[];
  wearSeasons: string[];
  wearHours: string[];
  sourceUrl: string;
  attribution: string;
  fetchedAt: Date;
  responseHash: string;
  partial: boolean; // any pyramid tier missing
}

export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

export interface ScentoOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  ratePerSecond?: number;
  burst?: number;
  cacheTtlMs?: number;
  fetch?: Fetcher;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_BODY_CHARS = 256 * 1024;
const MAX_CACHE_ENTRIES = 300;

const SLUG_RE = /^https:\/\/www\.scento\.com\/perfumes\/([a-z0-9-]{1,120})$/;

export class ScentoClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly rate: number;
  private readonly burst: number;
  private readonly ttl: number;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private tokens: number;
  private last: number;
  private readonly cache = new Map<string, { at: number; body: unknown; hash: string }>();

  constructor(opts: ScentoOptions = {}) {
    this.base = opts.baseUrl ?? 'https://www.scento.com/api/perfume/v1';
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.retries = opts.retries ?? 2;
    this.rate = opts.ratePerSecond ?? 1;
    this.burst = opts.burst ?? 8; // one resolve = search + up to a few profiles; sustained 1 req/s
    this.ttl = opts.cacheTtlMs ?? 6 * 3_600_000;
    this.fetcher = opts.fetch ?? ((u, i) => fetch(u, i));
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.tokens = this.burst;
    this.last = this.now();
  }

  /** Token bucket: refuse rather than queue unboundedly (no catalogue crawling). */
  private take(): void {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens < 1) throw new SourceError('SOURCE_RATE_LIMITED', 'local Scento request budget exhausted', 1);
    this.tokens -= 1;
  }

  private async get(path: string): Promise<{ body: unknown; hash: string }> {
    const cached = this.cache.get(path);
    if (cached && this.now() - cached.at < this.ttl) return cached;
    this.take();
    let lastErr: SourceError | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.sleep(250 * 2 ** (attempt - 1));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetcher(`${this.base}${path}`, {
          signal: ctrl.signal,
          headers: { accept: 'application/json', 'user-agent': 'F-Ray-grance/0.1 (personal, non-commercial)' },
        });
        if (res.status === 404) throw new SourceError('NOT_FOUND', 'no such Scento record');
        if (res.status === 429) {
          const ra = Number(res.headers.get('retry-after') ?? '60');
          throw new SourceError('SOURCE_RATE_LIMITED', 'Scento rate limit', Number.isFinite(ra) ? ra : 60);
        }
        if (res.status === 401 || res.status === 403 || res.status === 451) {
          throw new SourceError('SOURCE_TERMS_BLOCK', `Scento refused access (${res.status})`);
        }
        if (!res.ok) {
          lastErr = new SourceError('SOURCE_UNAVAILABLE', `Scento HTTP ${res.status}`);
          continue; // 5xx: retry
        }
        const text = await res.text();
        // Bounded bodies: a folio is a few KB; anything huge is not a documented answer.
        if (text.length > MAX_BODY_CHARS) throw new SourceError('SOURCE_SCHEMA_CHANGED', 'Scento response exceeds the size bound');
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw new SourceError('SOURCE_SCHEMA_CHANGED', 'Scento returned non-JSON');
        }
        const entry = { at: this.now(), body, hash: createHash('sha256').update(text).digest('hex') };
        if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!); // oldest first
        this.cache.set(path, entry);
        return entry;
      } catch (err) {
        if (err instanceof SourceError && err.code !== 'SOURCE_UNAVAILABLE') throw err;
        lastErr = err instanceof SourceError ? err : new SourceError('SOURCE_UNAVAILABLE', `Scento unreachable: ${(err as Error).name}`);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new SourceError('SOURCE_UNAVAILABLE', 'Scento unavailable');
  }

  /**
   * On-demand educational folio (Phase 11): one documented read-only route per call,
   * only a public concept term is sent. Returns plain-text, attributed, link-allowlisted data.
   */
  async educational(kind: EducationalKind, term: string): Promise<EducationalFolio> {
    const slug = educationalSlug(term);
    if (kind !== 'families' && !slug) throw new SourceError('NOT_FOUND', 'invalid educational term');
    const path =
      kind === 'material'
        ? `/materials/${slug}`
        : kind === 'term'
          ? `/lexicon/${slug}`
          : kind === 'family'
            ? `/families/${slug}`
            : kind === 'families'
              ? '/families'
              : `/journal?q=${encodeURIComponent(term.trim().slice(0, 80))}`;
    const { body } = await this.get(path);
    return normalizeFolio(kind, body, new Date(this.now()));
  }

  async search(query: string): Promise<SearchCandidate[]> {
    const q = query.trim().slice(0, 120);
    const { body } = await this.get(`/search?q=${encodeURIComponent(q)}&kind=perfume`);
    if (!Value.Check(SearchSchema, body)) throw new SourceError('SOURCE_SCHEMA_CHANGED', 'unexpected Scento search payload');
    const data = body as Static<typeof SearchSchema>;
    return data.detail.matches
      .filter((m) => m.kind === 'perfume')
      .map((m) => ({ providerId: SLUG_RE.exec(m.page)?.[1] ?? null, name: m.name, house: m.house, family: m.family, sourceUrl: m.page }));
  }

  async fetchProfile(providerId: string): Promise<SourceProfile> {
    if (!/^[a-z0-9-]{1,120}$/.test(providerId)) throw new SourceError('NOT_FOUND', 'invalid Scento id');
    const { body, hash } = await this.get(`/perfumes/${providerId}`);
    if (!Value.Check(ProfileSchema, body)) throw new SourceError('SOURCE_SCHEMA_CHANGED', 'unexpected Scento profile payload');
    const { detail: d, scento_page, cite } = body as Static<typeof ProfileSchema>;
    const pyramid = { top: d.pyramid?.top ?? null, heart: d.pyramid?.heart ?? null, base: d.pyramid?.base ?? null };
    return {
      providerId,
      name: d.name,
      house: d.house,
      year: d.year,
      concentrationRaw: d.concentration,
      family: d.family,
      subfamily: d.subfamily,
      pyramid,
      character: d.character,
      characterWords: d.character_words ?? [],
      wearSeasons: d.wears?.seasons ?? [],
      wearHours: d.wears?.hours ?? [],
      sourceUrl: scento_page.url,
      attribution: cite,
      fetchedAt: new Date(this.now()),
      responseHash: hash,
      partial: !pyramid.top?.length || !pyramid.heart?.length || !pyramid.base?.length,
    };
  }
}
