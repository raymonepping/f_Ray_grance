// NoteboxD gap filling (ADR-021): the NoteboxD-specific glue around the shared gap-source rules
// (domain/gap-sources.ts). Pure functions; nothing here saves anything.
import type { TrustedIdentity } from './exact-identity.js';
import type { Proposal } from './research.js';
import { mapGapProfile, pickExactHit, type GapHit, type GapProfile } from './gap-sources.js';
import type { NoteboxdHit, NoteboxdProfile } from '../providers/noteboxd.js';

export const noteboxdQuery = (brand: string, name: string) => `${brand} ${name}`.replace(/\s+/g, ' ').trim().slice(0, 120);

/** The public NoteboxD page for attribution links. */
export const noteboxdPage = (p: NoteboxdProfile) => (p.slug ? `https://www.noteboxd.com/fragrance/${p.slug}` : 'https://www.noteboxd.com');

export const toGapProfile = (p: NoteboxdProfile): GapProfile => ({ id: p.id, name: p.name, brand: p.brand, pageUrl: noteboxdPage(p), concentration: p.concentration, launchYear: p.launchYear, notes: p.notes });

/** Exactly one hit must be this fragrance; none or several means nothing is proposed. */
export const pickExact = (hits: NoteboxdHit[], id: TrustedIdentity): { hit: NoteboxdHit | null; reason: string | null; candidates: GapHit[] } => pickExactHit(hits, id, 'NoteboxD');

/** Proposals from a NoteboxD profile, or the reason it is not about this fragrance. */
export const mapProfile = (p: NoteboxdProfile, id: TrustedIdentity, year?: number): { proposals: Proposal[]; rejected: string | null } => mapGapProfile(toGapProfile(p), id, 'NoteboxD', year);
