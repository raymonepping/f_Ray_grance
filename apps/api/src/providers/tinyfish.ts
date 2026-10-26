// TinyFish client (ADR-013). Server-only; the API key is read from the file Vault Agent renders
// (/vault/rendered/tinyfish.json) on every call, so rotating the KV secret needs no restart, and
// an empty key means the feature is off. Only public fragrance identity text (brand, name,
// concentration) and result-page URLs are sent; never ratings, notes, observations or owner data.
// Responses are untrusted: size-capped, shape-checked and reduced to plain values by callers.
import { readFile } from 'node:fs/promises';

export type TinyFishErrorCode = 'TINYFISH_DISABLED' | 'TINYFISH_RATE_LIMITED' | 'TINYFISH_UNAVAILABLE' | 'TINYFISH_BAD_RESPONSE' | 'TINYFISH_RUN_FAILED';

export class TinyFishError extends Error {
  constructor(
    readonly code: TinyFishErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SearchResult {
  position: number;
  siteName: string;
  title: string;
  snippet: string;
  url: string;
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  title: string;
  html: string;
}

const SEARCH = 'https://api.search.tinyfish.ai';
const FETCH = 'https://api.fetch.tinyfish.ai';
const AGENT_ASYNC = 'https://agent.tinyfish.ai/v1/automation/run-async';
const RUNS = 'https://agent.tinyfish.ai/v1/runs';
const MAX_BODY = 2 * 1024 * 1024;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

export class TinyFishClient {
  constructor(
    private readonly keyFile: string | null,
    private readonly http: HttpFetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly now: () => number = Date.now,
    private readonly pollMs = 4000,
  ) {}

  /** True when a non-empty key is rendered (cheap; used to show or hide features). */
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

  private async call(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    const key = await this.key();
    if (!key) throw new TinyFishError('TINYFISH_DISABLED', 'Web research is not configured (no TinyFish key in Vault)');
    // A strongly referenced timer: AbortSignal.timeout() can be garbage-collected and then never
    // fires, which was observed live as a request hanging for 19 minutes.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.http(url, { ...init, headers: { ...(init.headers as Record<string, string>), 'X-API-Key': key, accept: 'application/json' }, signal: ctrl.signal });
      } catch {
        throw new TinyFishError('TINYFISH_UNAVAILABLE', ctrl.signal.aborted ? 'TinyFish did not answer in time' : 'TinyFish could not be reached');
      }
      if (res.status === 429) throw new TinyFishError('TINYFISH_RATE_LIMITED', 'TinyFish rate limit or daily allowance reached');
      if (res.status === 401 || res.status === 403) throw new TinyFishError('TINYFISH_DISABLED', 'TinyFish rejected the API key');
      if (!res.ok) throw new TinyFishError('TINYFISH_UNAVAILABLE', `TinyFish answered HTTP ${res.status}`);
      let text: string;
      try {
        text = await res.text();
      } catch {
        throw new TinyFishError('TINYFISH_UNAVAILABLE', 'TinyFish response was cut off');
      }
      if (text.length > MAX_BODY) throw new TinyFishError('TINYFISH_BAD_RESPONSE', 'TinyFish response too large');
      try {
        return JSON.parse(text);
      } catch {
        throw new TinyFishError('TINYFISH_BAD_RESPONSE', 'TinyFish response was not JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const d = (await this.call(`${SEARCH}?${new URLSearchParams({ query: query.slice(0, 300) })}`, { method: 'GET' }, 20_000)) as { results?: unknown };
    if (!Array.isArray(d.results)) throw new TinyFishError('TINYFISH_BAD_RESPONSE', 'Unexpected search response');
    return d.results.slice(0, 10).flatMap((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const url = str(o.url, 2048);
      return /^https:\/\//.test(url)
        ? [{ position: Number(o.position) || 0, siteName: str(o.site_name, 120), title: str(o.title, 200), snippet: str(o.snippet, 400), url }]
        : [];
    });
  }

  /** Fetch up to 10 pages as HTML scoped to the given CSS selectors (e.g. image metadata). */
  async fetchSelected(urls: string[], selectors: string[]): Promise<FetchedPage[]> {
    if (!urls.length) return [];
    const d = (await this.call(FETCH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls: urls.slice(0, 10), format: 'html', include_selectors: selectors.slice(0, 20) }) }, 60_000)) as {
      results?: unknown;
    };
    if (!Array.isArray(d.results)) throw new TinyFishError('TINYFISH_BAD_RESPONSE', 'Unexpected fetch response');
    return d.results.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return { url: str(o.url, 2048), finalUrl: str(o.final_url, 2048) || str(o.url, 2048), title: str(o.title, 200), html: typeof o.text === 'string' ? o.text.slice(0, 200_000) : '' };
    });
  }

  /**
   * One browser-agent run on a single page with a typed output schema. Uses TinyFish credits.
   * Runs asynchronously and is cancelled on TinyFish's side at our deadline: TinyFish does not
   * enforce max_duration_seconds for every account (a run was observed taking 19 minutes).
   */
  async agentRun(url: string, goal: string, schema: object, deadlineSeconds = 120): Promise<Record<string, unknown>> {
    const started = (await this.call(
      AGENT_ASYNC,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, goal, output_schema: schema, browser_profile: 'lite', agent_config: { max_duration_seconds: deadlineSeconds } }) },
      20_000,
    )) as { run_id?: unknown; id?: unknown };
    const runId = typeof started.run_id === 'string' ? started.run_id : typeof started.id === 'string' ? started.id : null;
    if (!runId || !/^[A-Za-z0-9_-]{1,100}$/.test(runId)) throw new TinyFishError('TINYFISH_BAD_RESPONSE', 'TinyFish did not return a run id');
    const deadline = this.now() + deadlineSeconds * 1000;
    for (;;) {
      await this.sleep(this.pollMs);
      const run = (await this.call(`${RUNS}/${runId}`, { method: 'GET' }, 15_000)) as { status?: unknown; result?: unknown; error?: { message?: unknown } | null };
      if (run.status === 'COMPLETED') {
        if (!run.result || typeof run.result !== 'object') throw new TinyFishError('TINYFISH_RUN_FAILED', 'The research run returned no result');
        return run.result as Record<string, unknown>;
      }
      if (run.status === 'FAILED' || run.status === 'CANCELLED') {
        throw new TinyFishError('TINYFISH_RUN_FAILED', str(run.error?.message, 200) || `The research run ${String(run.status).toLowerCase()}`);
      }
      if (this.now() > deadline) {
        await this.call(`${RUNS}/${runId}/cancel`, { method: 'POST' }, 15_000).catch(() => undefined);
        throw new TinyFishError('TINYFISH_RUN_FAILED', `The page took longer than ${deadlineSeconds} s to read; the run was cancelled`);
      }
    }
  }
}
