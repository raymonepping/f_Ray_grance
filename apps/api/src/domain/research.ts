// Web research (ADR-013): fills facts Scento does not provide, as a separate, lower-trust source.
// Pure functions only: query building, page selection by exact identity, the agent contract, and
// strict validation of what comes back. Nothing here decides to save anything; the owner reviews
// every proposal and saved values carry origin "research", below every other source.
import { brandKey } from './brands.js';
import { mapConcentration, type Concentration } from './concentration.js';
import { normalizeIdentity } from './identity.js';
import type { SearchResult } from '../providers/tinyfish.js';

export const RESEARCH_FIELDS = ['concentration', 'launch_year', 'pyramid', 'listed_notes'] as const;
export type ResearchField = (typeof RESEARCH_FIELDS)[number];

const SKIP_SITES = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|pinterest\.[a-z.]+|reddit\.com|x\.com|twitter\.com)$/i;

export function researchQuery(brand: string, name: string, concentration: string | null): string {
  return `${brand} ${name}${concentration ? ` ${concentration.replace(/_/g, ' ')}` : ''} perfume notes`.replace(/\s+/g, ' ').trim();
}

/** True when the text names exactly this fragrance: the full normalized name as a contiguous phrase. */
export function namesExactly(text: string, name: string): boolean {
  const t = ` ${normalizeIdentity(text) ?? ''} `;
  const n = normalizeIdentity(name);
  return !!n && t.includes(` ${n} `);
}

/** Result pages about exactly this fragrance, brand's own site first, no video/social pages. */
export function selectPages(results: SearchResult[], brand: string, name: string, max = 2): SearchResult[] {
  const bk = (brandKey(brand) || '').replace(/\s+/g, '');
  const host = (u: string) => {
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return '';
    }
  };
  return results
    .filter((r) => host(r.url) && !SKIP_SITES.test(host(r.url)) && namesExactly(r.title, name))
    .map((r) => ({ r, official: bk.length > 2 && host(r.url).replace(/[^a-z0-9]/g, '').includes(bk) }))
    .sort((a, b) => Number(b.official) - Number(a.official) || a.r.position - b.r.position)
    .slice(0, max)
    .map((x) => x.r);
}

export function agentGoal(brand: string, name: string): string {
  return [
    `Read this single page only. Do not navigate to other pages, log in, accept offers or buy anything.`,
    `Report facts printed on the page about the fragrance "${name}" by ${brand}.`,
    `Set exact_match to true only if the page is about exactly that fragrance, not a flanker or a similarly named product.`,
    `Copy values as printed. Notes may be written in prose (for example "warm incense top notes, a vetiver heart and a base of cedarwood"): put them in the matching tier.`,
    `List every concentration wording the page uses for this product in concentrations_seen (for example both "eau de toilette" and "Eau de Parfum" if both appear).`,
    `Use null when the page does not state a value. Never guess or use outside knowledge. Put one short supporting quote from the page in evidence.`,
  ].join(' ');
}

const notes = { type: 'array', items: { type: 'string' }, maxItems: 40, nullable: true };
export const AGENT_SCHEMA = {
  type: 'object',
  properties: {
    exact_match: { type: 'boolean' },
    product_name_on_page: { type: 'string' },
    concentrations_seen: { type: 'array', items: { type: 'string' }, maxItems: 6, nullable: true },
    launch_year: { type: 'integer', nullable: true, minimum: 1700, maximum: 2100 },
    top_notes: notes,
    heart_notes: notes,
    base_notes: notes,
    notes_without_tiers: notes,
    evidence: { type: 'string', nullable: true },
  },
  required: ['exact_match', 'product_name_on_page'],
} as const;

export interface Proposal {
  field: ResearchField;
  value: unknown;
  display: string;
  note: string | null;
}

export interface Finding {
  pageUrl: string;
  siteName: string;
  productNameOnPage: string;
  evidence: string | null;
  proposals: Proposal[];
  rejected: string | null;
}

const cleanList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/[\u0000-\u001f<>]/g, '').trim()).filter((x) => x.length >= 2 && x.length <= 80))].slice(0, 40)
    : [];
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Validate one agent result. Anything unverifiable is dropped, never repaired or guessed. */
export function validateFinding(raw: Record<string, unknown>, page: { url: string; siteName: string }, name: string): Finding {
  const productNameOnPage = text(raw.product_name_on_page, 200);
  const base = { pageUrl: page.url, siteName: page.siteName, productNameOnPage, evidence: text(raw.evidence, 400) || null };
  if (raw.exact_match !== true || !namesExactly(productNameOnPage, name)) {
    return { ...base, proposals: [], rejected: `The page is not about exactly "${name}" (it names "${productNameOnPage || 'something else'}").` };
  }
  const proposals: Proposal[] = [];
  const seen = cleanList(raw.concentrations_seen);
  const mapped = [...new Set(seen.map((s) => mapConcentration(s)).filter((c): c is Concentration => !!c))];
  const unmapped = seen.filter((s) => !mapConcentration(s));
  if (mapped.length === 1 && !unmapped.length) {
    const rawLabel = seen.find((s) => mapConcentration(s) === mapped[0])!;
    proposals.push({ field: 'concentration', value: { raw: rawLabel, normalized: mapped[0] }, display: rawLabel, note: null });
  } else if (seen.length) {
    // Several wordings (e.g. "eau de toilette" and "Eau de Parfum", or "Parfum Intense" next to
    // "parfum"), or wording outside the vocabulary: shown, never proposed.
    const why = mapped.length > 1 || (mapped.length && unmapped.length) ? 'The page uses conflicting concentrations, so none is proposed.' : 'Unrecognised concentration wording, so none is proposed.';
    proposals.push({ field: 'concentration', value: null, display: seen.join(' / '), note: why });
  }
  const year = raw.launch_year;
  if (typeof year === 'number' && Number.isInteger(year) && year >= 1700 && year <= 2100) {
    proposals.push({ field: 'launch_year', value: year, display: String(year), note: null });
  }
  const tiers = { top: cleanList(raw.top_notes), heart: cleanList(raw.heart_notes), base: cleanList(raw.base_notes) };
  if (tiers.top.length || tiers.heart.length || tiers.base.length) {
    const value = { top: tiers.top.length ? tiers.top : null, heart: tiers.heart.length ? tiers.heart : null, base: tiers.base.length ? tiers.base : null };
    const show = (['top', 'heart', 'base'] as const).map((k) => `${k[0]!.toUpperCase()}${k.slice(1)}: ${value[k]?.join(', ') ?? 'not stated'}`).join(' · ');
    proposals.push({ field: 'pyramid', value, display: show, note: null });
  }
  const untiered = cleanList(raw.notes_without_tiers);
  if (untiered.length) proposals.push({ field: 'listed_notes', value: untiered, display: untiered.join(', '), note: null });
  return { ...base, proposals, rejected: proposals.length ? null : 'The page states none of the missing details.' };
}
