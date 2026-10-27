// Fragrance sources in order (ADR-021): Scento, NoteboxD, ScentRev, web research. NoteboxD fills
// gaps only: the owner starts a check, exactly one search hit must be exactly this fragrance, and the
// owner accepts proposals field by field. Accepted values are origin "provider", source "noteboxd",
// and rank below Scento (app.claim_rank). A profile observed in the last 24 hours is reused instead of
// calling NoteboxD again. Only the brand and name are sent to NoteboxD.
import { createHash, randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import type { RotatingPool } from '../../db/pool.js';
import { mapConcentration } from '../../domain/concentration.js';
import { RESEARCH_FIELDS, type Proposal } from '../../domain/research.js';
import { mapProfile, noteboxdPage, noteboxdQuery, pickExact } from '../../domain/noteboxd.js';
import { addGapClaims, gapFields, type GapField } from '../../repo/enrichment.js';
import { NoteboxdError, type NoteboxdClient, type NoteboxdHit, type NoteboxdProfile } from '../../providers/noteboxd.js';

const Obj = <T extends Parameters<typeof Type.Object>[0]>(p: T) => Type.Object(p, { additionalProperties: false });
const Uuid = Type.String({ format: 'uuid' });
const TTL_MS = 30 * 60 * 1000;
const REUSE_HOURS = 24;
const NOTEBOXD_RANK = 31;
const ATTRIBUTION = 'NoteboxD (community encyclopedia)';

interface Stored {
  id: string;
  ownerId: string;
  fragranceId: string;
  profile: NoteboxdProfile;
  proposals: Proposal[];
  checkedAt: Date;
  expiresAt: number;
}

export async function sourceRoutes(base: FastifyInstance, deps: { pool: RotatingPool; noteboxd: NoteboxdClient }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();
  const findings = new Map<string, Stored>();
  const perOwner = (max: number, window: string) => ({
    rateLimit: { max, timeWindow: window, keyGenerator: (req: { session?: { owner: { id: string } } | null; ip: string }) => req.session?.owner.id ?? req.ip },
  });

  async function fragrance(id: string) {
    const { rows } = await db().query<{ brand: string; name: string; concentration: string | null; launch_year: number | null }>(
      'SELECT b.canonical_name AS brand, f.canonical_name AS name, f.concentration, f.launch_year FROM app.fragrances f JOIN app.brands b ON b.id = f.brand_id WHERE f.id = $1',
      [id],
    );
    if (!rows[0]) throw new ApiError('NOT_FOUND', 'Fragrance not found');
    return rows[0];
  }

  // Observations are catalogue data, not claims: they record what NoteboxD said, so a repeat check
  // within 24 hours needs no call. Claims are only written when the owner accepts a proposal.
  async function recentProfile(fragranceId: string): Promise<{ profile: NoteboxdProfile; checkedAt: Date } | null> {
    const { rows } = await db().query<{ mapped: { profile: NoteboxdProfile }; checked_at: Date }>(
      `SELECT mapped, checked_at FROM app.source_records
        WHERE provider = 'noteboxd' AND mapped->>'kind' = 'observation' AND mapped->>'forFragrance' = $1
          AND checked_at > now() - make_interval(hours => $2)
        ORDER BY checked_at DESC LIMIT 1`,
      [fragranceId, REUSE_HOURS],
    );
    return rows[0] ? { profile: rows[0].mapped.profile, checkedAt: rows[0].checked_at } : null;
  }

  async function recordObservation(fragranceId: string, profile: NoteboxdProfile) {
    const mapped = { kind: 'observation', forFragrance: fragranceId, profile };
    const hash = createHash('sha256').update(JSON.stringify(mapped)).digest('hex');
    await db().query(
      `INSERT INTO app.source_records (provider, external_id, source_url, attribution, response_hash, permitted_cache_class, mapped)
       VALUES ('noteboxd', $1, $2, $3, $4, 'user_lookup', $5)
       ON CONFLICT (provider, external_id, response_hash) DO UPDATE SET checked_at = now()`,
      [profile.id, noteboxdPage(profile), ATTRIBUTION, hash, JSON.stringify(mapped)],
    );
  }

  app.get('/fragrances/:id/sources', { schema: { params: Obj({ id: Uuid }) } }, async (req) => {
    const f = await fragrance(req.params.id);
    const enabled = await deps.noteboxd.enabled();
    return {
      order: [
        { key: 'scento', label: 'Scento', role: 'Identity reference and first source' },
        { key: 'noteboxd', label: 'NoteboxD', role: 'Community encyclopedia; fills gaps you review', enabled, remainingToday: enabled ? deps.noteboxd.remaining() : 0 },
        { key: 'scentrev', label: 'ScentRev', role: 'Community data; not connected yet (its API was unavailable)', enabled: false },
        { key: 'research', label: 'Web research', role: 'Lowest trust; pages you review' },
      ],
      noteboxd: { enabled, missing: await gapFields(db(), req.params.id, f, NOTEBOXD_RANK) },
    };
  });

  app.post('/fragrances/:id/sources/noteboxd/check', { config: perOwner(6, '10 minutes'), schema: { params: Obj({ id: Uuid }) } }, async (req) => {
    const owner = req.session!.owner.id;
    const f = await fragrance(req.params.id);
    const missing = await gapFields(db(), req.params.id, f, NOTEBOXD_RANK);
    const identity = { brand: f.brand, name: f.name, concentration: mapConcentration(f.concentration?.replace(/_/g, ' ') ?? null) };
    if (!missing.length) return { available: true, missing, finding: null, message: 'Nothing is missing that NoteboxD could fill, so NoteboxD was not called.' };
    let profile: NoteboxdProfile | null = null;
    let checkedAt = new Date();
    let fromCache = false;
    let candidates: NoteboxdHit[] = [];
    try {
      const cached = await recentProfile(req.params.id);
      if (cached) {
        ({ profile, checkedAt } = cached);
        fromCache = true;
      } else {
        const pick = pickExact(await deps.noteboxd.search(noteboxdQuery(f.brand, f.name)), identity);
        if (!pick.hit) return { available: true, missing, finding: null, message: pick.reason, candidates: pick.candidates, remainingToday: deps.noteboxd.remaining() };
        candidates = [];
        profile = await deps.noteboxd.fragrance(pick.hit.id);
        if (!profile) return { available: true, missing, finding: null, message: 'NoteboxD no longer has that entry.', remainingToday: deps.noteboxd.remaining() };
        await recordObservation(req.params.id, profile);
      }
    } catch (e) {
      if (!(e instanceof NoteboxdError)) throw e;
      return { available: false, code: e.code, message: e.message, missing, finding: null, remainingToday: deps.noteboxd.remaining() };
    }
    const mapped = mapProfile(profile, identity);
    const now = Date.now();
    for (const [k, v] of findings) if (v.expiresAt < now) findings.delete(k);
    const stored: Stored = { id: randomUUID(), ownerId: owner, fragranceId: req.params.id, profile, proposals: mapped.proposals, checkedAt, expiresAt: now + TTL_MS };
    findings.set(stored.id, stored);
    return {
      available: true,
      missing,
      fromCache,
      candidates,
      remainingToday: deps.noteboxd.remaining(),
      finding: {
        id: stored.id,
        pageUrl: noteboxdPage(profile),
        siteName: 'NoteboxD',
        productNameOnPage: `${profile.brand} ${profile.name}`.trim(),
        evidence: null,
        rejected: mapped.rejected,
        // Only gaps can be saved: NoteboxD never replaces Scento, official or your own data.
        proposals: mapped.proposals.map((p) => {
          const fillsGap = missing.includes(p.field as GapField);
          return { field: p.field, display: p.display, note: p.note ?? (fillsGap ? null : 'Already known from a more trusted source, so not proposed.'), acceptable: p.value !== null && fillsGap, fillsGap };
        }),
      },
    };
  });

  app.post(
    '/fragrances/:id/sources/noteboxd/:fid/accept',
    { schema: { params: Obj({ id: Uuid, fid: Uuid }), body: Obj({ fields: Type.Array(Type.Union(RESEARCH_FIELDS.map((f) => Type.Literal(f))), { minItems: 1, maxItems: 4, uniqueItems: true }) }) } },
    async (req) => {
      const owner = req.session!.owner.id;
      const s = findings.get(req.params.fid);
      if (!s || s.ownerId !== owner || s.fragranceId !== req.params.id || s.expiresAt < Date.now()) throw new ApiError('NOT_FOUND', 'NoteboxD result expired; check again');
      const wanted = new Set<string>(req.body.fields as string[]);
      const f = await fragrance(req.params.id);
      const gaps = new Set<string>(await gapFields(db(), req.params.id, f, NOTEBOXD_RANK));
      const chosen = s.proposals.filter((p) => p.value !== null && wanted.has(p.field) && gaps.has(p.field));
      if (!chosen.length) throw new ApiError('VALIDATION_FAILED', 'None of the selected details fills a gap; nothing was saved');
      const n = await addGapClaims(
        db(),
        req.params.id,
        { url: noteboxdPage(s.profile), siteName: 'NoteboxD', checkedAt: s.checkedAt, evidence: null, productNameOnPage: `${s.profile.brand} ${s.profile.name}`.trim() },
        chosen.map((p) => ({ field: p.field as GapField, value: p.value })),
        { provider: 'noteboxd', origin: 'provider', attribution: ATTRIBUTION, externalId: s.profile.id },
      );
      return { saved: n, fields: chosen.map((p) => p.field) };
    },
  );
}
