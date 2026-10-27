// Gap-filling sources after Scento (ADR-021 NoteboxD, ADR-022 Fragella). Pure functions shared by
// every such source: one normalised profile shape, the exact pick, and the mapping to proposals in
// the web-research vocabulary and value shapes, so the same review-and-accept path stores them.
// Each provider only has its own client that produces GapProfile values. Nothing here saves anything.
import { brandKey } from './brands.js';
import { mapConcentration, type Concentration } from './concentration.js';
import { checkExactIdentity, type TrustedIdentity } from './exact-identity.js';
import type { Proposal } from './research.js';

export type GapTier = 'top' | 'heart' | 'base' | null;

export interface GapHit {
  id: string;
  name: string;
  brand: string;
}

export interface GapProfile extends GapHit {
  /** Public page or API reference for attribution. */
  pageUrl: string;
  concentration: string | null;
  launchYear: number | null;
  notes: { name: string; tier: GapTier }[];
  /** A flat note list the source gives besides (or instead of) tiers. */
  generalNotes?: string[];
}

const sameHouse = (a: string, b: string) => !!a && !!b && brandKey(a) === brandKey(b);
export const isExact = (brand: string, name: string, id: TrustedIdentity) => sameHouse(brand, id.brand) && checkExactIdentity(`${brand} ${name}`, id).exact;

/** Exactly one hit must be this fragrance; none or several means nothing is proposed. */
export function pickExactHit<T extends GapHit>(hits: T[], id: TrustedIdentity, source: string): { hit: T | null; reason: string | null; candidates: GapHit[] } {
  const exact = [...new Map(hits.filter((h) => isExact(h.brand, h.name, id)).map((h) => [h.id, h])).values()];
  const brief = (h: GapHit) => ({ id: h.id, name: h.name, brand: h.brand });
  if (exact.length === 1) return { hit: exact[0]!, reason: null, candidates: [] };
  return exact.length
    ? { hit: null, reason: `${source} lists ${exact.length} entries named exactly "${id.name}"; none is chosen automatically.`, candidates: exact.slice(0, 5).map(brief) }
    : { hit: null, reason: `${source} lists no entry that is exactly "${id.name}" by ${id.brand}.`, candidates: hits.slice(0, 5).map(brief) };
}

/** Proposals from a source profile, or the reason it is not about this fragrance. */
export function mapGapProfile(p: GapProfile, id: TrustedIdentity, source: string, year = new Date().getUTCFullYear()): { proposals: Proposal[]; rejected: string | null } {
  if (!isExact(p.brand, p.name, id)) return { proposals: [], rejected: `${source}'s profile is "${p.brand} ${p.name}", not exactly this fragrance.` };
  const conc: Concentration | null = p.concentration ? mapConcentration(p.concentration) : null;
  if (conc && id.concentration && conc !== id.concentration) {
    return { proposals: [], rejected: `${source}'s profile states ${p.concentration}, a different concentration, so it is a different product.` };
  }
  const proposals: Proposal[] = [];
  if (p.concentration) {
    proposals.push(conc ? { field: 'concentration', value: { raw: p.concentration, normalized: conc }, display: p.concentration, note: null } : { field: 'concentration', value: null, display: p.concentration, note: 'Unrecognised concentration wording, so none is proposed.' });
  }
  if (p.launchYear !== null && p.launchYear >= 1700 && p.launchYear <= year + 1) {
    proposals.push({ field: 'launch_year', value: p.launchYear, display: String(p.launchYear), note: null });
  }
  const tier = (t: 'top' | 'heart' | 'base') => {
    const l = [...new Set(p.notes.filter((n) => n.tier === t).map((n) => n.name))];
    return l.length ? l : null;
  };
  const value = { top: tier('top'), heart: tier('heart'), base: tier('base') };
  // A pyramid only when every note has a tier and all three tiers are present: a partial pyramid
  // would misrepresent the fragrance, so the notes are then proposed as an untiered list.
  if (p.notes.length && p.notes.every((n) => n.tier !== null) && value.top && value.heart && value.base) {
    const show = (['top', 'heart', 'base'] as const).map((k) => `${k[0]!.toUpperCase()}${k.slice(1)}: ${value[k]!.join(', ')}`).join(' · ');
    proposals.push({ field: 'pyramid', value, display: show, note: null });
  } else {
    const names = [...new Set(p.generalNotes?.length ? p.generalNotes : p.notes.map((n) => n.name))];
    if (names.length) {
      proposals.push({ field: 'listed_notes', value: names, display: names.join(', '), note: `${source} does not give every note a top, heart or base tier, so these are listed without tiers.` });
    }
  }
  return { proposals, rejected: proposals.some((x) => x.value !== null) ? null : `${source} states none of the missing details.` };
}
