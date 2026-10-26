// Exact-identity resolver (spec/DATA_SOURCES.md §3). A similar name is never enough:
// EXACT requires brand (via alias registry) AND full normalised name to match, AND the
// fetched profile to confirm both (search listings can disagree with profiles), AND any
// user-specified concentration to agree. Near matches are surfaced for review, never merged.
import { normalizeIdentity } from './identity.js';
import { brandKey } from './brands.js';
import { mapConcentration, type Concentration } from './concentration.js';
import { SourceError, type ScentoClient, type SearchCandidate, type SourceProfile } from '../providers/scento.js';

export type ResolutionState = 'exact' | 'candidate_needs_review' | 'unresolved' | 'conflict';

export interface ResolveInput {
  brand: string;
  name: string;
  concentration?: Concentration | null;
}

export interface CandidateView {
  providerId: string | null;
  name: string;
  house: string;
  sourceUrl: string;
  match: 'exact_name' | 'near_match' | 'other';
  reason: string;
  derivedId?: boolean;
}

export interface Resolution {
  state: ResolutionState;
  errorCode?: 'NO_EXACT_MATCH' | 'AMBIGUOUS_IDENTITY' | 'SOURCE_PARTIAL_DATA' | SourceError['code'];
  reason: string;
  local?: { fragranceId: string; identityStatus: string } | undefined;
  profile?: ProfilePreview;
  candidates: CandidateView[];
}

export interface ProfilePreview {
  providerId: string;
  name: string;
  house: string;
  concentration: Concentration | null;
  concentrationRaw: string | null;
  family: string | null;
  subfamily: string | null;
  pyramid: SourceProfile['pyramid'];
  partial: boolean;
  sourceUrl: string;
  attribution: string;
  fetchedAt: string;
}

const tokens = (s: string) => new Set((normalizeIdentity(s) ?? '').split(' ').filter(Boolean));

/** Classify a provider listing against the requested identity. */
export function classify(input: ResolveInput, c: { name: string; house: string }): CandidateView['match'] {
  if (brandKey(c.house) !== brandKey(input.brand)) return 'other';
  if (normalizeIdentity(c.name) === normalizeIdentity(input.name)) return 'exact_name';
  const want = tokens(input.name);
  const have = tokens(c.name);
  const overlap = [...want].filter((t) => have.has(t)).length;
  return overlap > 0 && overlap >= Math.min(want.size, have.size) - 1 ? 'near_match' : 'other';
}

function describe(input: ResolveInput, c: SearchCandidate, match: CandidateView['match']): CandidateView {
  let reason = 'different identity';
  if (match === 'exact_name') reason = 'brand and full name match';
  if (match === 'near_match') {
    const want = tokens(input.name);
    const have = tokens(c.name);
    const extra = [...have].filter((t) => !want.has(t));
    const missing = [...want].filter((t) => !have.has(t));
    reason = `distinct identity: ${extra.length ? `extra "${extra.join(' ')}"` : ''}${extra.length && missing.length ? ', ' : ''}${missing.length ? `missing "${missing.join(' ')}"` : ''}, not the same fragrance`;
  }
  return { providerId: c.providerId, name: c.name, house: c.house, sourceUrl: c.sourceUrl, match, reason, ...(c.derivedId ? { derivedId: true } : {}) };
}

export function preview(p: SourceProfile): ProfilePreview {
  return {
    providerId: p.providerId,
    name: p.name,
    house: p.house,
    concentration: mapConcentration(p.concentrationRaw),
    concentrationRaw: p.concentrationRaw,
    family: p.family,
    subfamily: p.subfamily,
    pyramid: p.pyramid,
    partial: p.partial,
    sourceUrl: p.sourceUrl,
    attribution: p.attribution,
    fetchedAt: p.fetchedAt.toISOString(),
  };
}

export interface ResolverDeps {
  scento: ScentoClient;
  /** Exact local identity lookup (normalised brand + name [+ concentration]). */
  findLocal: (input: ResolveInput) => Promise<{ fragranceId: string; identityStatus: string }[]>;
}

export async function resolve(deps: ResolverDeps, input: ResolveInput): Promise<Resolution> {
  const local = await deps.findLocal(input);
  if (local.length === 1 && local[0]!.identityStatus === 'verified') {
    return { state: 'exact', reason: 'verified local identity', local: local[0], candidates: [] };
  }

  let found: SearchCandidate[];
  try {
    found = await deps.scento.search(`${input.brand} ${input.name}`);
  } catch (err) {
    const code = err instanceof SourceError ? err.code : 'SOURCE_UNAVAILABLE';
    return {
      state: local.length ? 'candidate_needs_review' : 'unresolved',
      errorCode: code,
      reason: `Scento lookup failed (${code}); ${local.length ? 'local draft exists' : 'create a manual draft or retry later'}`,
      local: local[0],
      candidates: [],
    };
  }
  const candidates = found.map((c) => describe(input, c, classify(input, c))).filter((c) => c.match !== 'other');
  const exact = candidates.filter((c) => c.match === 'exact_name' && c.providerId);

  if (exact.length === 0) {
    return {
      state: candidates.length ? 'candidate_needs_review' : 'unresolved',
      errorCode: 'NO_EXACT_MATCH',
      reason: candidates.length
        ? 'no exact Scento record; similar names are listed for review and will NOT be substituted'
        : 'no matching Scento record; create a manual draft (no notes will be invented)',
      local: local[0],
      candidates,
    };
  }

  // Verify each exact listing against its profile (listings can disagree with profiles).
  const verified: { c: CandidateView; p: SourceProfile }[] = [];
  const mismatched: CandidateView[] = [];
  for (const c of exact) {
    let p: SourceProfile;
    try {
      p = await deps.scento.fetchProfile(c.providerId!);
    } catch (err) {
      const code = err instanceof SourceError ? err.code : 'SOURCE_UNAVAILABLE';
      // A derived id (listing linked only a brand page) may simply not exist: not verifiable, keep going.
      if (code === 'NOT_FOUND' && c.derivedId) {
        mismatched.push({ ...c, match: 'near_match', reason: 'Scento lists this name but has no profile page for it, so it cannot be verified' });
        continue;
      }
      return { state: 'candidate_needs_review', errorCode: code, reason: `profile fetch failed (${code})`, local: local[0], candidates };
    }
    if (brandKey(p.house) === brandKey(input.brand) && normalizeIdentity(p.name) === normalizeIdentity(input.name)) {
      verified.push({ c, p });
    } else {
      mismatched.push({ ...c, match: 'near_match', reason: `listing says "${c.name}" but the profile is "${p.name}" (${p.concentrationRaw ?? 'concentration unknown'}) so the source is inconsistent and needs review` });
    }
  }

  const byConcentration = input.concentration
    ? verified.filter(({ p }) => mapConcentration(p.concentrationRaw) === input.concentration)
    : verified;

  if (verified.length === 0) {
    return { state: 'conflict', errorCode: 'NO_EXACT_MATCH', reason: 'exact-looking listing contradicted by its profile', local: local[0], candidates: [...mismatched, ...candidates.filter((c) => c.match !== 'exact_name')] };
  }
  if (input.concentration && byConcentration.length === 0) {
    const got = verified.map(({ p }) => p.concentrationRaw ?? 'unknown').join(', ');
    return { state: 'conflict', errorCode: 'NO_EXACT_MATCH', reason: `requested ${input.concentration}, Scento lists ${got}`, local: local[0], profile: preview(verified[0]!.p), candidates };
  }
  if (byConcentration.length > 1) {
    return { state: 'candidate_needs_review', errorCode: 'AMBIGUOUS_IDENTITY', reason: 'several exact records; choose the concentration', local: local[0], candidates };
  }
  const { p } = byConcentration[0]!;
  return {
    state: 'exact',
    ...(p.partial ? { errorCode: 'SOURCE_PARTIAL_DATA' as const } : {}),
    reason: p.partial ? 'exact identity; Scento pyramid is incomplete (missing tiers stay unknown)' : 'exact identity confirmed by Scento profile',
    local: local[0],
    profile: preview(p),
    candidates: candidates.filter((c) => c.match !== 'exact_name'),
  };
}
