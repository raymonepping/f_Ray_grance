// Provenance-preserving enrichment (spec/DATA_MODEL.md §5, DATA_SOURCES.md §4-5).
// - Raw provider observations are reduced to permitted mapped fields + a response hash.
// - Every field is a claim with an origin; user corrections are never superseded by a refresh.
// - The effective value of a field is chosen by origin priority: user > official > provider > derived.
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { canonicalBrand } from '../domain/brands.js';
import { mapConcentration } from '../domain/concentration.js';
import type { SourceProfile } from '../providers/scento.js';

type Db = pg.Pool;
type Tx = pg.PoolClient;

const PROVIDER_FIELDS = ['identity', 'concentration', 'family', 'subfamily', 'pyramid', 'listed_notes', 'signature_materials', 'character', 'character_words', 'wears'] as const;
// Fields added after the first observations were stored; backfilled from an unchanged observation.
const LATER_FIELDS = ['listed_notes', 'signature_materials'] as const;
export type ClaimField = (typeof PROVIDER_FIELDS)[number] | 'launch_year';
export const USER_EDITABLE_FIELDS = ['concentration', 'family', 'subfamily', 'pyramid', 'character', 'launch_year'] as const;

async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

function mapped(p: SourceProfile) {
  return {
    name: p.name,
    house: p.house,
    year: p.year,
    concentration: p.concentrationRaw,
    family: p.family,
    subfamily: p.subfamily,
    pyramid: p.pyramid,
    listed_notes: p.listedNotes,
    signature_materials: p.signatureMaterials,
    character: p.character,
    character_words: p.characterWords,
    wears: { seasons: p.wearSeasons, hours: p.wearHours },
  };
}

async function upsertNote(c: Tx, label: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO app.note_dictionary (display_name) VALUES ($1)
     ON CONFLICT (normalized_name) DO UPDATE SET display_name = app.note_dictionary.display_name
     RETURNING id`,
    [label.trim()],
  );
  return rows[0]!.id;
}

export async function writePyramid(c: Tx, fragranceId: string, claimId: string, pyramid: SourceProfile['pyramid']): Promise<void> {
  for (const tier of ['top', 'heart', 'base'] as const) {
    const labels = pyramid[tier] ?? [];
    for (const [i, label] of labels.entries()) {
      if (!label.trim()) continue;
      const noteId = await upsertNote(c, label);
      await c.query(
        `INSERT INTO app.fragrance_notes (fragrance_id, note_id, tier, source_claim_id, original_label, position)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [fragranceId, noteId, tier, claimId, label, i],
      );
    }
  }
}

async function writeProviderObservation(c: Tx, fragranceId: string, p: SourceProfile): Promise<{ sourceRecordId: string; created: boolean }> {
  const existing = await c.query<{ id: string }>(
    `SELECT id FROM app.source_records WHERE provider = 'scento' AND external_id = $1 AND response_hash = $2`,
    [p.providerId, p.responseHash],
  );
  const hadClaims = existing.rows[0]
    ? (await c.query('SELECT 1 FROM app.source_claims WHERE source_record_id = $1 AND fragrance_id = $2 LIMIT 1', [existing.rows[0].id, fragranceId])).rowCount
    : 0;
  if (existing.rows[0] && hadClaims) {
    // Same observation already stored: only add facts this app version newly reads from it.
    const later = { listed_notes: p.listedNotes, signature_materials: p.signatureMaterials };
    for (const field of LATER_FIELDS) {
      if (!later[field].length) continue;
      await c.query(
        `INSERT INTO app.source_claims (fragrance_id, source_record_id, origin, field_name, value, claimed_at)
         SELECT $1, $2, 'provider', $3, $4, $5
          WHERE NOT EXISTS (SELECT 1 FROM app.source_claims WHERE fragrance_id = $1 AND source_record_id = $2 AND field_name = $3)`,
        [fragranceId, existing.rows[0].id, field, JSON.stringify(later[field]), p.fetchedAt],
      );
    }
    return { sourceRecordId: existing.rows[0].id, created: false };
  }

  const sr =
    existing.rows[0]?.id ??
    (
      await c.query<{ id: string }>(
        `INSERT INTO app.source_records (provider, external_id, source_url, attribution, checked_at, response_hash, permitted_cache_class, mapped)
         VALUES ('scento', $1, $2, $3, $4, $5, 'user_lookup', $6) RETURNING id`,
        [p.providerId, p.sourceUrl, p.attribution, p.fetchedAt, p.responseHash, JSON.stringify(mapped(p))],
      )
    ).rows[0]!.id;

  // A newer provider observation supersedes older PROVIDER claims only; user/official/derived stay.
  await c.query(`UPDATE app.source_claims SET superseded_at = now() WHERE fragrance_id = $1 AND origin = 'provider' AND superseded_at IS NULL`, [fragranceId]);
  const m = mapped(p);
  const values: Record<(typeof PROVIDER_FIELDS)[number], unknown> = {
    identity: { name: m.name, house: m.house, year: m.year },
    concentration: { raw: m.concentration, normalized: mapConcentration(m.concentration) },
    family: m.family,
    subfamily: m.subfamily,
    pyramid: m.pyramid,
    listed_notes: m.listed_notes.length ? m.listed_notes : null,
    signature_materials: m.signature_materials.length ? m.signature_materials : null,
    character: m.character,
    character_words: m.character_words,
    wears: m.wears,
  };
  for (const field of PROVIDER_FIELDS) {
    const v = values[field];
    if (v === null || v === undefined) continue; // unknown stays absent, never invented
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO app.source_claims (fragrance_id, source_record_id, origin, field_name, value, claimed_at)
       VALUES ($1, $2, 'provider', $3, $4, $5) RETURNING id`,
      [fragranceId, sr, field, JSON.stringify(v), p.fetchedAt],
    );
    if (field === 'pyramid') await writePyramid(c, fragranceId, rows[0]!.id, p.pyramid);
  }
  return { sourceRecordId: sr, created: true };
}

/** Create (or attach to) the verified fragrance for a server-verified exact profile. */
export async function enrichExact(db: Db, p: SourceProfile): Promise<{ fragranceId: string; created: boolean; observationCreated: boolean }> {
  return tx(db, async (c) => {
    const brand = canonicalBrand(p.house);
    const b = await c.query<{ id: string }>(
      `INSERT INTO app.brands (canonical_name) VALUES ($1)
       ON CONFLICT (normalized_name) DO UPDATE SET canonical_name = app.brands.canonical_name RETURNING id`,
      [brand],
    );
    const brandId = b.rows[0]!.id;
    const concentration = mapConcentration(p.concentrationRaw);
    const found = await c.query<{ id: string }>(
      `SELECT id FROM app.fragrances WHERE brand_id = $1 AND normalized_name = app.normalize_identity($2)
         AND flanker IS NULL AND concentration IS NOT DISTINCT FROM $3 AND formulation_revision IS NULL`,
      [brandId, p.name, concentration],
    );
    let fragranceId = found.rows[0]?.id;
    let created = false;
    if (!fragranceId) {
      const ins = await c.query<{ id: string }>(
        `INSERT INTO app.fragrances (brand_id, canonical_name, concentration, launch_year, identity_status)
         VALUES ($1, $2, $3, $4, 'verified') RETURNING id`,
        [brandId, p.name, concentration, p.year],
      );
      fragranceId = ins.rows[0]!.id;
      created = true;
    } else {
      await c.query(`UPDATE app.fragrances SET identity_status = 'verified' WHERE id = $1 AND identity_status <> 'verified'`, [fragranceId]);
    }
    const obs = await writeProviderObservation(c, fragranceId, p);
    return { fragranceId, created, observationCreated: obs.created };
  });
}

/** Refresh an existing fragrance from a newer profile; refuses if the identity changed. */
export async function refreshFromProvider(db: Db, fragranceId: string, p: SourceProfile): Promise<{ observationCreated: boolean }> {
  return tx(db, async (c) => {
    const { rows } = await c.query<{ name: string; brand: string }>(
      `SELECT f.canonical_name AS name, b.canonical_name AS brand FROM app.fragrances f JOIN app.brands b ON b.id = f.brand_id WHERE f.id = $1`,
      [fragranceId],
    );
    const f = rows[0];
    if (!f) throw new Error('NOT_FOUND');
    const same = await c.query<{ ok: boolean }>(
      `SELECT app.normalize_identity($1) = app.normalize_identity($2) AND app.normalize_identity($3) = app.normalize_identity($4) AS ok`,
      [f.name, p.name, f.brand, canonicalBrand(p.house)],
    );
    if (!same.rows[0]?.ok) throw new Error('IDENTITY_CHANGED');
    const obs = await writeProviderObservation(c, fragranceId, p);
    return { observationCreated: obs.created };
  });
}

/** Manual override: a user claim. Never removed by provider refreshes. */
export async function addUserClaim(db: Db, fragranceId: string, field: (typeof USER_EDITABLE_FIELDS)[number], value: unknown, ownerId?: string): Promise<string> {
  return tx(db, async (c) => {
    await c.query(`UPDATE app.source_claims SET superseded_at = now() WHERE fragrance_id = $1 AND origin = 'user' AND field_name = $2 AND superseded_at IS NULL`, [
      fragranceId,
      field,
    ]);
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO app.source_claims (fragrance_id, origin, field_name, value, corrected_by_owner) VALUES ($1, 'user', $2, $3, $4) RETURNING id`,
      [fragranceId, field, JSON.stringify(value), ownerId ?? null],
    );
    if (field === 'pyramid') await writePyramid(c, fragranceId, rows[0]!.id, value as SourceProfile['pyramid']);
    return rows[0]!.id;
  });
}

/** Draft identity for unresolved fragrances: identity claims only, no invented notes. */
export async function createDraft(db: Db, input: { brand: string; name: string; concentration: string | null; ownerId?: string }): Promise<{ fragranceId: string; created: boolean }> {
  return tx(db, async (c) => {
    const b = await c.query<{ id: string }>(
      `INSERT INTO app.brands (canonical_name) VALUES ($1)
       ON CONFLICT (normalized_name) DO UPDATE SET canonical_name = app.brands.canonical_name RETURNING id`,
      [canonicalBrand(input.brand)],
    );
    const existing = await c.query<{ id: string }>(
      `SELECT id FROM app.fragrances WHERE brand_id = $1 AND normalized_name = app.normalize_identity($2)
         AND flanker IS NULL AND concentration IS NOT DISTINCT FROM $3 AND formulation_revision IS NULL`,
      [b.rows[0]!.id, input.name, input.concentration],
    );
    if (existing.rows[0]) return { fragranceId: existing.rows[0].id, created: false };
    const f = await c.query<{ id: string }>(
      `INSERT INTO app.fragrances (brand_id, canonical_name, concentration, identity_status) VALUES ($1, $2, $3, 'draft') RETURNING id`,
      [b.rows[0]!.id, input.name, input.concentration],
    );
    await c.query(`INSERT INTO app.source_claims (fragrance_id, origin, field_name, value, corrected_by_owner) VALUES ($1, 'user', 'identity', $2, $3)`, [
      f.rows[0]!.id,
      JSON.stringify({ name: input.name, house: input.brand, entered_as: 'manual_draft' }),
      input.ownerId ?? null,
    ]);
    return { fragranceId: f.rows[0]!.id, created: true };
  });
}

export interface EffectiveField {
  value: unknown;
  origin: 'user' | 'official' | 'provider' | 'derived' | 'research';
  claimedAt: string;
  source: { provider: string; url: string | null; attribution: string | null; checkedAt: string } | null;
}

const PRIORITY = { user: 1, official: 2, provider: 3, derived: 4, research: 5 } as const;

/** A claim that states nothing (all-unknown pyramid, empty list, null concentration) never hides a lower source. */
export function isEmptyClaim(field: string, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (field === 'pyramid') return (['top', 'heart', 'base'] as const).every((k) => !Array.isArray(v[k]) || (v[k] as unknown[]).length === 0);
    if (field === 'concentration') return !v.raw && !v.normalized;
    if (field === 'wears') return (!Array.isArray(v.seasons) || !v.seasons.length) && (!Array.isArray(v.hours) || !v.hours.length);
  }
  return false;
}

/** Effective, provenance-labelled profile (what the UI shows). Unknown fields are simply absent. */
export async function effectiveProfile(db: Db, fragranceId: string): Promise<Record<string, EffectiveField>> {
  const { rows } = await db.query<{
    field_name: string;
    value: unknown;
    origin: keyof typeof PRIORITY;
    claimed_at: Date;
    provider: string | null;
    source_url: string | null;
    attribution: string | null;
    checked_at: Date | null;
  }>(
    `SELECT c.field_name, c.value, c.origin, c.claimed_at, r.provider, r.source_url, r.attribution, r.checked_at
       FROM app.source_claims c LEFT JOIN app.source_records r ON r.id = c.source_record_id
      WHERE c.fragrance_id = $1 AND c.superseded_at IS NULL
      ORDER BY c.field_name,
               app.claim_rank(c.origin, r.provider), -- source order (ADR-021): Scento, NoteboxD, ScentRev, ...
               c.claimed_at DESC`,
    [fragranceId],
  );
  const out: Record<string, EffectiveField> = {};
  for (const r of rows) {
    if (out[r.field_name]) continue; // a higher-precedence, non-empty claim already won
    if (isEmptyClaim(r.field_name, r.value)) continue;
    out[r.field_name] = {
      value: r.value,
      origin: r.origin,
      claimedAt: r.claimed_at.toISOString(),
      source: r.provider ? { provider: r.provider, url: r.source_url, attribution: r.attribution, checkedAt: r.checked_at!.toISOString() } : null,
    };
  }
  return out;
}

export type GapField = 'concentration' | 'launch_year' | 'pyramid' | 'listed_notes';

/** Mirrors app.claim_rank (migrations 0008/0009, ADR-021/022): the lower, the more trusted. */
export function claimRank(origin: string, provider: string | null): number {
  if (origin === 'user') return 10;
  if (origin === 'official') return 20;
  if (origin === 'provider') return ({ scento: 30, noteboxd: 31, scentrev: 32, fragella: 33 } as Record<string, number>)[provider ?? ''] ?? 34;
  return origin === 'derived' ? 40 : 50;
}

/**
 * Gap fields a source of rank `rank` may fill: fields with no effective value, or whose effective
 * value comes from a lower-ranked (less trusted) source. The verified identity's own concentration
 * and launch year always count as known.
 */
export async function gapFields(
  db: Db,
  fragranceId: string,
  f: { concentration: string | null; launch_year: number | null },
  rank: number,
): Promise<GapField[]> {
  const eff = await effectiveProfile(db, fragranceId);
  const known = (k: string) => {
    const e = eff[k];
    return !!e && claimRank(e.origin, e.source?.provider ?? null) <= rank;
  };
  const fields: GapField[] = ['concentration', 'launch_year', 'pyramid', 'listed_notes'];
  return fields.filter((k) => {
    if (k === 'concentration') return !f.concentration && !known('concentration');
    if (k === 'launch_year') return !f.launch_year && !known('launch_year');
    if (k === 'listed_notes') return !known('pyramid') && !known('listed_notes');
    return !known(k);
  });
}

/** Where owner-accepted gap-filling values come from (ADR-013 web research, ADR-021 NoteboxD). */
export interface GapSource {
  provider: 'tinyfish' | 'noteboxd' | 'fragella';
  origin: 'research' | 'provider';
  attribution: string;
  /** Stable id at the source; defaults to a hash of the page URL. */
  externalId?: string;
}

const WEB_RESEARCH = (siteName: string): GapSource => ({ provider: 'tinyfish', origin: 'research', attribution: `Web research via TinyFish: ${siteName}`.slice(0, 200) });

/** Store owner-accepted web-research proposals as origin "research", citing the page they came from. */
export async function addResearchClaims(
  db: Db,
  fragranceId: string,
  page: { url: string; siteName: string; checkedAt: Date; evidence: string | null; productNameOnPage: string },
  claims: { field: GapField; value: unknown }[],
): Promise<number> {
  return addGapClaims(db, fragranceId, page, claims, WEB_RESEARCH(page.siteName));
}

/**
 * Store owner-accepted gap-filling values with their source record. A newer value from the same
 * source supersedes its own earlier value for that field; other sources' claims are untouched, and
 * app.claim_rank decides which one is effective.
 */
export async function addGapClaims(
  db: Db,
  fragranceId: string,
  page: { url: string; siteName: string; checkedAt: Date; evidence: string | null; productNameOnPage: string },
  claims: { field: GapField; value: unknown }[],
  source: GapSource,
): Promise<number> {
  return tx(db, async (c) => {
    const mappedObs = { page: page.url, site: page.siteName, productNameOnPage: page.productNameOnPage, evidence: page.evidence, claims };
    const hash = createHash('sha256').update(JSON.stringify(mappedObs)).digest('hex');
    // external_id: the source's own id, or a stable hash of the page URL (the URL is kept in source_url).
    const externalId = source.externalId ?? createHash('sha256').update(page.url).digest('hex');
    const existing = await c.query<{ id: string }>(`SELECT id FROM app.source_records WHERE provider = $1 AND external_id = $2 AND response_hash = $3`, [source.provider, externalId, hash]);
    const sr =
      existing.rows[0]?.id ??
      (
        await c.query<{ id: string }>(
          `INSERT INTO app.source_records (provider, external_id, source_url, attribution, checked_at, response_hash, permitted_cache_class, mapped)
           VALUES ($7, $1, $6, $2, $3, $4, 'user_lookup', $5) RETURNING id`,
          [externalId, source.attribution.slice(0, 200), page.checkedAt, hash, JSON.stringify(mappedObs), page.url.slice(0, 2000), source.provider],
        )
      ).rows[0]!.id;
    for (const claim of claims) {
      await c.query(
        `UPDATE app.source_claims SET superseded_at = now()
          WHERE fragrance_id = $1 AND origin = $3 AND field_name = $2 AND superseded_at IS NULL
            AND source_record_id IN (SELECT id FROM app.source_records WHERE provider = $4)`,
        [fragranceId, claim.field, source.origin, source.provider],
      );
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO app.source_claims (fragrance_id, source_record_id, origin, field_name, value) VALUES ($1, $2, $5, $3, $4) RETURNING id`,
        [fragranceId, sr, claim.field, JSON.stringify(claim.value), source.origin],
      );
      if (claim.field === 'pyramid') await writePyramid(c, fragranceId, rows[0]!.id, claim.value as SourceProfile['pyramid']);
    }
    return claims.length;
  });
}

/** Local exact identity lookup for the resolver. */
export async function findLocalExact(db: Db, input: { brand: string; name: string; concentration?: string | null }) {
  const { rows } = await db.query<{ id: string; identity_status: string }>(
    `SELECT f.id, f.identity_status FROM app.fragrances f JOIN app.brands b ON b.id = f.brand_id
      WHERE b.normalized_name = app.normalize_identity($1) AND f.normalized_name = app.normalize_identity($2)
        AND ($3::text IS NULL OR f.concentration = $3) AND f.flanker IS NULL`,
    [canonicalBrand(input.brand), input.name, input.concentration ?? null],
  );
  return rows.map((r) => ({ fragranceId: r.id, identityStatus: r.identity_status }));
}

/** Local verified GTIN mapping (no external barcode resolver is approved — DATA_SOURCES §4). */
export async function findVerifiedGtin(db: Db, gtin14: string) {
  const { rows } = await db.query<{ fragrance_id: string; variant_id: string; bottle_ml: string | null }>(
    `SELECT fragrance_id, id AS variant_id, bottle_ml FROM app.product_variants WHERE gtin14 = $1 AND verification_state = 'verified'`,
    [gtin14],
  );
  return rows[0] ?? null;
}
