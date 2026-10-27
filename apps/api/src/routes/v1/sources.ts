// Fragrance sources in order (ADR-021, ADR-022): Scento, NoteboxD, ScentRev, Fragella, web research.
// The sources after Scento fill gaps only: the owner starts a check, exactly one hit must be exactly
// this fragrance, and the owner accepts proposals field by field. Accepted values are origin
// "provider" with their own source and rank (app.claim_rank). Every check is recorded (a profile, or
// "no exact entry") and reused: NoteboxD for 24 hours, Fragella for 30 days. Fragella is the last
// resort: the server allows it only after NoteboxD was tried (or is off). Only brand and name are sent.
import { createHash, randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import type { RotatingPool } from '../../db/pool.js';
import { mapConcentration } from '../../domain/concentration.js';
import { RESEARCH_FIELDS, type Proposal } from '../../domain/research.js';
import { mapGapProfile, pickExactHit, type GapHit, type GapProfile } from '../../domain/gap-sources.js';
import { noteboxdQuery, toGapProfile } from '../../domain/noteboxd.js';
import { addGapClaims, gapFields, type GapField } from '../../repo/enrichment.js';
import { NoteboxdError, type NoteboxdClient } from '../../providers/noteboxd.js';
import { FragellaError, type FragellaClient } from '../../providers/fragella.js';

const Obj = <T extends Parameters<typeof Type.Object>[0]>(p: T) => Type.Object(p, { additionalProperties: false });
const Uuid = Type.String({ format: 'uuid' });
const TTL_MS = 30 * 60 * 1000;

type Key = 'noteboxd' | 'fragella';
const SOURCE: Record<Key, { label: string; rank: number; reuseHours: number; attribution: string }> = {
  noteboxd: { label: 'NoteboxD', rank: 31, reuseHours: 24, attribution: 'NoteboxD (community encyclopedia)' },
  fragella: { label: 'Fragella', rank: 33, reuseHours: 30 * 24, attribution: 'Fragella API' },
};

interface Stored {
  id: string;
  key: Key;
  ownerId: string;
  fragranceId: string;
  profile: GapProfile;
  proposals: Proposal[];
  checkedAt: Date;
  expiresAt: number;
}

type Recorded = { kind: 'observation'; profile: GapProfile; checkedAt: Date } | { kind: 'miss'; reason: string; candidates: GapHit[]; checkedAt: Date };

export async function sourceRoutes(base: FastifyInstance, deps: { pool: RotatingPool; noteboxd: NoteboxdClient; fragella: FragellaClient }): Promise<void> {
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

  // Checks are catalogue observations, not claims: they record what a source said (or that it had
  // no exact entry), so a repeat check needs no call. Claims are only written on acceptance.
  async function recent(key: Key, fragranceId: string): Promise<Recorded | null> {
    const { rows } = await db().query<{ mapped: { kind: 'observation' | 'miss'; profile?: GapProfile; reason?: string; candidates?: GapHit[] }; checked_at: Date }>(
      `SELECT mapped, checked_at FROM app.source_records
        WHERE provider = $1 AND mapped->>'forFragrance' = $2 AND mapped->>'kind' IN ('observation', 'miss')
          AND checked_at > now() - make_interval(hours => $3)
        ORDER BY checked_at DESC LIMIT 1`,
      [key, fragranceId, SOURCE[key].reuseHours],
    );
    const r = rows[0];
    if (!r) return null;
    return r.mapped.kind === 'observation' && r.mapped.profile
      ? { kind: 'observation', profile: r.mapped.profile, checkedAt: r.checked_at }
      : { kind: 'miss', reason: r.mapped.reason ?? `${SOURCE[key].label} had no exact entry.`, candidates: r.mapped.candidates ?? [], checkedAt: r.checked_at };
  }

  async function record(key: Key, fragranceId: string, rec: { kind: 'observation'; profile: GapProfile } | { kind: 'miss'; reason: string; candidates: GapHit[] }) {
    const mapped = { ...rec, forFragrance: fragranceId };
    const hash = createHash('sha256').update(JSON.stringify(mapped)).digest('hex');
    const externalId = rec.kind === 'observation' ? rec.profile.id.slice(0, 160) : `miss:${fragranceId}`;
    await db().query(
      `INSERT INTO app.source_records (provider, external_id, source_url, attribution, response_hash, permitted_cache_class, mapped)
       VALUES ($1, $2, $3, $4, $5, 'user_lookup', $6)
       ON CONFLICT (provider, external_id, response_hash) DO UPDATE SET checked_at = now()`,
      [key, externalId, rec.kind === 'observation' ? rec.profile.pageUrl : null, SOURCE[key].attribution, hash, JSON.stringify(mapped)],
    );
  }

  /** Why Fragella may not be checked yet, or null when it may (ADR-022: last resort). */
  async function fragellaGate(fragranceId: string, missing: GapField[]): Promise<string | null> {
    if (!missing.length) return 'Nothing is missing that Fragella could fill.';
    if ((await deps.noteboxd.enabled()) && !(await recent('noteboxd', fragranceId))) return 'Fragella is the last resort: check NoteboxD first.';
    return null;
  }

  app.get('/fragrances/:id/sources', { schema: { params: Obj({ id: Uuid }) } }, async (req) => {
    const f = await fragrance(req.params.id);
    const nb = await deps.noteboxd.enabled();
    const fr = await deps.fragella.enabled();
    const frMissing = await gapFields(db(), req.params.id, f, SOURCE.fragella.rank);
    let spendable: number | null = null;
    if (fr) spendable = await deps.fragella.spendable().catch(() => null); // /usage is free
    return {
      order: [
        { key: 'scento', label: 'Scento', role: 'Identity reference and first source' },
        { key: 'noteboxd', label: 'NoteboxD', role: 'Community encyclopedia; fills gaps you review', enabled: nb, remainingToday: nb ? deps.noteboxd.remaining() : 0 },
        { key: 'scentrev', label: 'ScentRev', role: 'Community data; not connected yet (its API was unavailable)', enabled: false },
        { key: 'fragella', label: 'Fragella', role: 'Last resort: 20 calls per month', enabled: fr, remainingThisMonth: spendable },
        { key: 'research', label: 'Web research', role: 'Lowest trust; pages you review' },
      ],
      noteboxd: { enabled: nb, missing: await gapFields(db(), req.params.id, f, SOURCE.noteboxd.rank) },
      fragella: { enabled: fr, missing: frMissing, blockedBy: fr ? await fragellaGate(req.params.id, frMissing) : null, remainingThisMonth: spendable },
    };
  });

  for (const key of ['noteboxd', 'fragella'] as const) {
    const src = SOURCE[key];
    app.post(`/fragrances/:id/sources/${key}/check`, { config: perOwner(key === 'fragella' ? 3 : 6, '10 minutes'), schema: { params: Obj({ id: Uuid }) } }, async (req) => {
      const owner = req.session!.owner.id;
      const f = await fragrance(req.params.id);
      const missing = await gapFields(db(), req.params.id, f, src.rank);
      const identity = { brand: f.brand, name: f.name, concentration: mapConcentration(f.concentration?.replace(/_/g, ' ') ?? null) };
      if (!missing.length) return { available: true, missing, finding: null, message: `Nothing is missing that ${src.label} could fill, so ${src.label} was not called.` };
      if (key === 'fragella') {
        const why = await fragellaGate(req.params.id, missing);
        if (why) throw new ApiError('CONFLICT', why);
      }
      let profile: GapProfile;
      let checkedAt = new Date();
      let fromCache = false;
      try {
        const cached = await recent(key, req.params.id);
        if (cached?.kind === 'miss') return { available: true, missing, finding: null, fromCache: true, message: cached.reason, candidates: cached.candidates };
        if (cached) {
          ({ profile, checkedAt } = cached);
          fromCache = true;
        } else if (key === 'noteboxd') {
          const pick = pickExactHit(await deps.noteboxd.search(noteboxdQuery(f.brand, f.name)), identity, src.label);
          const p = pick.hit ? await deps.noteboxd.fragrance(pick.hit.id) : null;
          if (!p) {
            const reason = pick.reason ?? 'NoteboxD no longer has that entry.';
            await record(key, req.params.id, { kind: 'miss', reason, candidates: pick.candidates });
            return { available: true, missing, finding: null, message: reason, candidates: pick.candidates, remainingToday: deps.noteboxd.remaining() };
          }
          profile = toGapProfile(p);
          await record(key, req.params.id, { kind: 'observation', profile });
        } else {
          const pick = pickExactHit(await deps.fragella.search(noteboxdQuery(f.brand, f.name)), identity, src.label);
          if (!pick.hit) {
            await record(key, req.params.id, { kind: 'miss', reason: pick.reason!, candidates: pick.candidates });
            return { available: true, missing, finding: null, message: pick.reason, candidates: pick.candidates };
          }
          profile = pick.hit;
          await record(key, req.params.id, { kind: 'observation', profile });
        }
      } catch (e) {
        if (!(e instanceof NoteboxdError) && !(e instanceof FragellaError)) throw e;
        return { available: false, code: e.code, message: e.message, missing, finding: null };
      }
      const mapped = mapGapProfile(profile, identity, src.label);
      const now = Date.now();
      for (const [k, v] of findings) if (v.expiresAt < now) findings.delete(k);
      const stored: Stored = { id: randomUUID(), key, ownerId: owner, fragranceId: req.params.id, profile, proposals: mapped.proposals, checkedAt, expiresAt: now + TTL_MS };
      findings.set(stored.id, stored);
      return {
        available: true,
        missing,
        fromCache,
        candidates: [],
        ...(key === 'noteboxd' ? { remainingToday: deps.noteboxd.remaining() } : {}),
        finding: {
          id: stored.id,
          pageUrl: profile.pageUrl,
          siteName: src.label,
          productNameOnPage: `${profile.brand} ${profile.name}`.trim(),
          evidence: null,
          rejected: mapped.rejected,
          // Only gaps can be saved: a lower source never replaces a more trusted one.
          proposals: mapped.proposals.map((p) => {
            const fillsGap = missing.includes(p.field as GapField);
            return { field: p.field, display: p.display, note: p.note ?? (fillsGap ? null : 'Already known from a more trusted source, so not proposed.'), acceptable: p.value !== null && fillsGap, fillsGap };
          }),
        },
      };
    });

    app.post(
      `/fragrances/:id/sources/${key}/:fid/accept`,
      { schema: { params: Obj({ id: Uuid, fid: Uuid }), body: Obj({ fields: Type.Array(Type.Union(RESEARCH_FIELDS.map((f) => Type.Literal(f))), { minItems: 1, maxItems: 4, uniqueItems: true }) }) } },
      async (req) => {
        const owner = req.session!.owner.id;
        const s = findings.get(req.params.fid);
        if (!s || s.key !== key || s.ownerId !== owner || s.fragranceId !== req.params.id || s.expiresAt < Date.now()) throw new ApiError('NOT_FOUND', `${src.label} result expired; check again`);
        const wanted = new Set<string>(req.body.fields as string[]);
        const f = await fragrance(req.params.id);
        const gaps = new Set<string>(await gapFields(db(), req.params.id, f, src.rank));
        const chosen = s.proposals.filter((p) => p.value !== null && wanted.has(p.field) && gaps.has(p.field));
        if (!chosen.length) throw new ApiError('VALIDATION_FAILED', 'None of the selected details fills a gap; nothing was saved');
        const n = await addGapClaims(
          db(),
          req.params.id,
          { url: s.profile.pageUrl, siteName: src.label, checkedAt: s.checkedAt, evidence: null, productNameOnPage: `${s.profile.brand} ${s.profile.name}`.trim() },
          chosen.map((p) => ({ field: p.field as GapField, value: p.value })),
          { provider: key, origin: 'provider', attribution: src.attribution, externalId: s.profile.id.slice(0, 160) },
        );
        return { saved: n, fields: chosen.map((p) => p.field) };
      },
    );
  }
}
