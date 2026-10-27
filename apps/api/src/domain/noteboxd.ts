// NoteboxD gap filling (ADR-021). Pure functions: choose exactly one search hit that is exactly this
// fragrance, then turn its profile into proposals in the web-research vocabulary and value shapes, so
// the same review-and-accept path stores them. Nothing here saves anything.
import { brandKey } from './brands.js';
import { mapConcentration, type Concentration } from './concentration.js';
import { checkExactIdentity, type TrustedIdentity } from './exact-identity.js';
import type { Proposal } from './research.js';
import type { NoteboxdHit, NoteboxdProfile } from '../providers/noteboxd.js';

export const noteboxdQuery = (brand: string, name: string) => `${brand} ${name}`.replace(/\s+/g, ' ').trim().slice(0, 120);

const sameHouse = (a: string, b: string) => !!a && !!b && brandKey(a) === brandKey(b);
const isExact = (brand: string, name: string, id: TrustedIdentity) => sameHouse(brand, id.brand) && checkExactIdentity(`${brand} ${name}`, id).exact;

/** Exactly one hit must be this fragrance; none or several means nothing is proposed. */
export function pickExact(hits: NoteboxdHit[], id: TrustedIdentity): { hit: NoteboxdHit | null; reason: string | null; candidates: NoteboxdHit[] } {
  const exact = [...new Map(hits.filter((h) => isExact(h.brand, h.name, id)).map((h) => [h.id, h])).values()];
  if (exact.length === 1) return { hit: exact[0]!, reason: null, candidates: [] };
  const candidates = hits.slice(0, 5);
  return exact.length
    ? { hit: null, reason: `NoteboxD lists ${exact.length} entries named exactly "${id.name}"; none is chosen automatically.`, candidates: exact.slice(0, 5) }
    : { hit: null, reason: `NoteboxD lists no entry that is exactly "${id.name}" by ${id.brand}.`, candidates };
}

/** Proposals from a NoteboxD profile, or the reason it is not about this fragrance. */
export function mapProfile(p: NoteboxdProfile, id: TrustedIdentity, year = new Date().getUTCFullYear()): { proposals: Proposal[]; rejected: string | null } {
  if (!isExact(p.brand, p.name, id)) return { proposals: [], rejected: `NoteboxD's profile is "${p.brand} ${p.name}", not exactly this fragrance.` };
  const conc: Concentration | null = p.concentration ? mapConcentration(p.concentration) : null;
  if (conc && id.concentration && conc !== id.concentration) {
    return { proposals: [], rejected: `NoteboxD's profile states ${p.concentration}, a different concentration, so it is a different product.` };
  }
  const proposals: Proposal[] = [];
  if (p.concentration) {
    proposals.push(conc ? { field: 'concentration', value: { raw: p.concentration, normalized: conc }, display: p.concentration, note: null } : { field: 'concentration', value: null, display: p.concentration, note: 'Unrecognised concentration wording, so none is proposed.' });
  }
  if (p.launchYear !== null && p.launchYear >= 1700 && p.launchYear <= year + 1) {
    proposals.push({ field: 'launch_year', value: p.launchYear, display: String(p.launchYear), note: null });
  }
  const names = [...new Set(p.notes.map((n) => n.name))];
  if (names.length) {
    if (p.notes.every((n) => n.tier !== null)) {
      const tier = (t: 'top' | 'heart' | 'base') => {
        const l = [...new Set(p.notes.filter((n) => n.tier === t).map((n) => n.name))];
        return l.length ? l : null;
      };
      const value = { top: tier('top'), heart: tier('heart'), base: tier('base') };
      const show = (['top', 'heart', 'base'] as const).map((k) => `${k[0]!.toUpperCase()}${k.slice(1)}: ${value[k]?.join(', ') ?? 'not stated'}`).join(' · ');
      proposals.push({ field: 'pyramid', value, display: show, note: null });
    } else {
      // Some notes have no tier: a partial pyramid would misrepresent the fragrance, so the notes
      // are proposed as an untiered list.
      proposals.push({ field: 'listed_notes', value: names, display: names.join(', '), note: 'NoteboxD does not give every note a tier, so these are listed without top, heart or base.' });
    }
  }
  return { proposals, rejected: proposals.some((x) => x.value !== null) ? null : 'NoteboxD states none of the missing details.' };
}

/** The public NoteboxD page for attribution links. */
export const noteboxdPage = (p: NoteboxdProfile) => (p.slug ? `https://www.noteboxd.com/fragrance/${p.slug}` : 'https://www.noteboxd.com');
