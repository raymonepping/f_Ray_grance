// Owner-started image lookups (ADR-013). Both produce CANDIDATES the owner reviews; nothing is
// stored until the owner picks one, and then it goes through the normal validated ingestion.
//  - Barcode: Open Beauty Facts product API for a GTIN; images on images.openbeautyfacts.org,
//    CC BY-SA, attribution kept. Exact product = exact barcode, but the product name is shown so a
//    wrong or shared barcode is visible.
//  - Web search: TinyFish Search for this exact fragrance, then TinyFish Fetch reads each result
//    page's og:image / twitter:image. Only result pages that name exactly this fragrance are used.
// Candidates live in memory for 30 minutes and are addressed by an opaque id, so these routes can
// never be used to make the server fetch a caller-supplied URL.
import { randomUUID } from 'node:crypto';
import { normalizeGtin } from '../domain/gtin.js';
import { mapConcentration } from '../domain/concentration.js';
import { checkExactIdentity } from '../domain/exact-identity.js';
import type { TinyFishClient } from '../providers/tinyfish.js';

export interface Candidate {
  id: string;
  ownerId: string;
  fragranceId: string;
  kind: 'approved_remote' | 'web_search';
  imageUrl: string;
  pageUrl: string;
  siteName: string;
  title: string;
  attribution: string;
  licenseNotes: string;
  barcode: string | null;
  exactName: boolean;
  expiresAt: number;
}

export type PublicCandidate = Omit<Candidate, 'ownerId' | 'imageUrl' | 'expiresAt'> & { previewUrl: string };

const TTL_MS = 30 * 60 * 1000;
export const OBF_IMAGE_HOST = 'images.openbeautyfacts.org';
const OBF_API = 'https://world.openbeautyfacts.org/api/v2/product';

export class CandidateStore {
  private readonly items = new Map<string, Candidate>();
  constructor(private readonly now: () => number = Date.now) {}

  add(c: Omit<Candidate, 'id' | 'expiresAt'>): Candidate {
    this.sweep();
    // Bounded: oldest entries go first when the store is full.
    while (this.items.size >= 500) this.items.delete(this.items.keys().next().value!);
    const full = { ...c, id: randomUUID(), expiresAt: this.now() + TTL_MS };
    this.items.set(full.id, full);
    return full;
  }

  get(id: string, ownerId: string): Candidate | null {
    const c = this.items.get(id);
    if (!c || c.ownerId !== ownerId || c.expiresAt < this.now()) return null;
    return c;
  }

  private sweep() {
    const t = this.now();
    for (const [k, v] of this.items) if (v.expiresAt < t) this.items.delete(k);
  }
}

export const publicCandidate = (c: Candidate): PublicCandidate => {
  const { ownerId: _o, imageUrl: _i, expiresAt: _e, ...rest } = c;
  void _o;
  void _i;
  void _e;
  return { ...rest, previewUrl: `/api/v1/images/candidates/${c.id}/preview` };
};

const httpsUrl = (raw: unknown, base?: string): string | null => {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const u = new URL(raw.replace(/&amp;/g, '&'), base);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
};

/** og:image / twitter:image / image_src from an HTML fragment (first match wins). */
export function pageImage(html: string, base: string): string | null {
  const tags = html.slice(0, 200_000).match(/<(meta|link)\b[^>]*>/gi) ?? [];
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? null;
  for (const want of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const t of tags) {
      const key = (attr(t, 'property') ?? attr(t, 'name') ?? '').toLowerCase();
      if (key === want) {
        const u = httpsUrl(attr(t, 'content'), base);
        if (u) return u;
      }
    }
  }
  for (const t of tags) if (/rel\s*=\s*["']image_src["']/i.test(t)) return httpsUrl(attr(t, 'href'), base);
  return null;
}

export type BarcodeOutcome =
  | { barcode: string; found: true; productName: string; brands: string; productUrl: string; imageUrl: string | null }
  | { barcode: string; found: false; reason: string };

/** Look one GTIN up in Open Beauty Facts. Returns the product and its front image, or why not. */
export async function lookupBarcode(input: string, http: typeof fetch = fetch): Promise<BarcodeOutcome> {
  const g = normalizeGtin(input);
  if (!g.ok) return { barcode: input.slice(0, 20), found: false, reason: 'Not a valid barcode (check digit or length)' };
  // OBF keys products by the 13-digit form (UPC-A carries a leading 0); GTIN-14 adds one more.
  const code = g.gtin14.startsWith('0') ? g.gtin14.slice(1) : g.gtin14;
  let res: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000); // strong timer (AbortSignal.timeout can be GC'd)
  try {
    res = await http(`${OBF_API}/${code}?fields=code,product_name,brands,image_front_url,image_url`, {
      headers: { 'user-agent': 'F-Ray-grance/0.1 (personal collection; barcode image lookup)', accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    return { barcode: code, found: false, reason: 'Open Beauty Facts could not be reached' };
  }
  if (res.status === 404) return { barcode: code, found: false, reason: 'Not in Open Beauty Facts' };
  if (!res.ok) return { barcode: code, found: false, reason: `Open Beauty Facts answered HTTP ${res.status}` };
  let body: string;
  try {
    body = await res.text();
  } catch {
    return { barcode: code, found: false, reason: 'Open Beauty Facts response was cut off' };
  } finally {
    clearTimeout(timer);
  }
  if (body.length > 512 * 1024) return { barcode: code, found: false, reason: 'Unexpected response size' };
  let d: { status?: unknown; product?: Record<string, unknown> };
  try {
    d = JSON.parse(body);
  } catch {
    return { barcode: code, found: false, reason: 'Unexpected response' };
  }
  if (d.status !== 1 || !d.product) return { barcode: code, found: false, reason: 'Not in Open Beauty Facts' };
  const p = d.product;
  const img = httpsUrl(p.image_front_url) ?? httpsUrl(p.image_url);
  const imageUrl = img && new URL(img).hostname === OBF_IMAGE_HOST ? img : null;
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 200) : '');
  return { barcode: code, found: true, productName: clean(p.product_name), brands: clean(p.brands), productUrl: `https://world.openbeautyfacts.org/product/${code}`, imageUrl };
}

/** Web search candidates: exact-name result pages and the image each page declares. */
export async function searchImageCandidates(tf: TinyFishClient, q: { brand: string; name: string; concentration: string | null }) {
  const results = await tf.search(`${q.brand} ${q.name}${q.concentration ? ` ${q.concentration.replace(/_/g, ' ')}` : ''} perfume bottle`);
  const id = { brand: q.brand, name: q.name, concentration: mapConcentration(q.concentration) };
  const pages = results.filter((r) => checkExactIdentity(r.title, id).exact && !/(youtube|tiktok|instagram|facebook|reddit)\./i.test(r.url)).slice(0, 8);
  const fetched = await tf.fetchSelected(
    pages.map((p) => p.url),
    ['meta[property="og:image"]', 'meta[property="og:image:secure_url"]', 'meta[name="twitter:image"]', 'link[rel="image_src"]'],
  );
  const byUrl = new Map(fetched.map((f) => [f.url, f]));
  const seen = new Set<string>();
  return pages.flatMap((p) => {
    const f = byUrl.get(p.url);
    const imageUrl = f ? pageImage(f.html, f.finalUrl || p.url) : null;
    if (!imageUrl || seen.has(imageUrl)) return [];
    seen.add(imageUrl);
    return [{ imageUrl, pageUrl: p.url, siteName: p.siteName || new URL(p.url).hostname, title: p.title }];
  });
}
