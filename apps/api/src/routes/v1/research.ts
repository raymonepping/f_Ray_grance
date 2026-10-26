// Web research API (ADR-013). Owner-started, owner-reviewed: a run proposes facts from pages about
// exactly this fragrance; only proposals the owner accepts are stored, as origin "research" (the
// lowest precedence, labelled "Web research" in the UI). Only brand, name and concentration are sent
// to TinyFish. Proposals live in memory for 30 minutes and are accepted by id, never by value.
import { randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import type { RotatingPool } from '../../db/pool.js';
import { AGENT_SCHEMA, RESEARCH_FIELDS, agentGoal, researchQuery, selectPages, validateFinding, type Finding } from '../../domain/research.js';
import { addResearchClaims, effectiveProfile } from '../../repo/enrichment.js';
import { TinyFishError, type TinyFishClient } from '../../providers/tinyfish.js';

const Obj = <T extends Parameters<typeof Type.Object>[0]>(p: T) => Type.Object(p, { additionalProperties: false });
const Uuid = Type.String({ format: 'uuid' });
const TTL_MS = 30 * 60 * 1000;

interface Stored extends Finding {
  id: string;
  ownerId: string;
  fragranceId: string;
  checkedAt: Date;
  expiresAt: number;
}

export async function researchRoutes(base: FastifyInstance, deps: { pool: RotatingPool; tinyfish: TinyFishClient }): Promise<void> {
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

  async function missing(id: string, f: { concentration: string | null; launch_year: number | null }) {
    const fields = await effectiveProfile(db(), id);
    return RESEARCH_FIELDS.filter((k) => {
      if (k === 'concentration') return !f.concentration && !fields.concentration;
      if (k === 'launch_year') return !f.launch_year && !fields.launch_year;
      if (k === 'listed_notes') return !fields.pyramid && !fields.listed_notes;
      return !fields[k];
    });
  }

  app.get('/fragrances/:id/research', { schema: { params: Obj({ id: Uuid }) } }, async (req) => {
    const f = await fragrance(req.params.id);
    return { enabled: await deps.tinyfish.enabled(), missing: await missing(req.params.id, f) };
  });

  // A run reads up to two pages with a browser agent (often 1-2 minutes), so it runs as a
  // background job: POST starts it (or returns the one already running), GET polls it.
  interface Job { id: string; ownerId: string; fragranceId: string; status: 'running' | 'done'; result: Record<string, unknown> | null; expiresAt: number }
  const jobs = new Map<string, Job>();

  async function runResearch(owner: string, fragranceId: string): Promise<Record<string, unknown>> {
    const f = await fragrance(fragranceId);
    const before = await missing(fragranceId, f);
    try {
      const results = await deps.tinyfish.search(researchQuery(f.brand, f.name, f.concentration));
      const pages = selectPages(results, f.brand, f.name, 2);
      if (!pages.length) return { available: true, missing: before, findings: [], message: `No result page names exactly "${f.name}".` };
      const settled = await Promise.allSettled(pages.map((p) => deps.tinyfish.agentRun(p.url, agentGoal(f.brand, f.name), AGENT_SCHEMA)));
      const now = Date.now();
      for (const [k, v] of findings) if (v.expiresAt < now) findings.delete(k);
      const out = settled.map((s, i) => {
        const page = { url: pages[i]!.url, siteName: pages[i]!.siteName || new URL(pages[i]!.url).hostname };
        const finding: Finding =
          s.status === 'fulfilled'
            ? validateFinding(s.value, page, f.name)
            : { pageUrl: page.url, siteName: page.siteName, productNameOnPage: '', evidence: null, proposals: [], rejected: s.reason instanceof TinyFishError ? s.reason.message : 'The research run failed' };
        const stored: Stored = { ...finding, id: randomUUID(), ownerId: owner, fragranceId, checkedAt: new Date(), expiresAt: now + TTL_MS };
        findings.set(stored.id, stored);
        return {
          id: stored.id,
          pageUrl: finding.pageUrl,
          siteName: finding.siteName,
          productNameOnPage: finding.productNameOnPage,
          evidence: finding.evidence,
          rejected: finding.rejected,
          proposals: finding.proposals.map((p) => ({ field: p.field, display: p.display, note: p.note, acceptable: p.value !== null, fillsGap: before.includes(p.field) })),
        };
      });
      return { available: true, missing: before, findings: out };
    } catch (e) {
      if (!(e instanceof TinyFishError)) throw e;
      return { available: false, code: e.code, message: e.message, missing: before, findings: [] };
    }
  }

  app.post('/fragrances/:id/research', { config: perOwner(3, '10 minutes'), schema: { params: Obj({ id: Uuid }) } }, async (req, reply) => {
    const owner = req.session!.owner.id;
    await fragrance(req.params.id);
    const now = Date.now();
    for (const [k, v] of jobs) if (v.expiresAt < now) jobs.delete(k);
    const running = [...jobs.values()].find((j) => j.ownerId === owner && j.fragranceId === req.params.id && j.status === 'running');
    if (running) return reply.code(202).send({ jobId: running.id, status: 'running' });
    const job: Job = { id: randomUUID(), ownerId: owner, fragranceId: req.params.id, status: 'running', result: null, expiresAt: now + TTL_MS };
    jobs.set(job.id, job);
    void runResearch(owner, req.params.id)
      .then((r) => Object.assign(job, { status: 'done', result: r }))
      .catch((err: unknown) => {
        req.log.error({ err }, 'research job failed');
        Object.assign(job, { status: 'done', result: { available: false, code: 'INTERNAL', message: 'Research failed unexpectedly', findings: [] } });
      });
    return reply.code(202).send({ jobId: job.id, status: 'running' });
  });

  app.get('/fragrances/:id/research/jobs/:jid', { schema: { params: Obj({ id: Uuid, jid: Uuid }) } }, async (req) => {
    const j = jobs.get(req.params.jid);
    if (!j || j.ownerId !== req.session!.owner.id || j.fragranceId !== req.params.id) throw new ApiError('NOT_FOUND', 'Research job not found; start it again');
    return j.status === 'running' ? { status: 'running' } : { status: 'done', ...j.result };
  });

  app.post(
    '/fragrances/:id/research/:fid/accept',
    { schema: { params: Obj({ id: Uuid, fid: Uuid }), body: Obj({ fields: Type.Array(Type.Union(RESEARCH_FIELDS.map((f) => Type.Literal(f))), { minItems: 1, maxItems: 4, uniqueItems: true }) }) } },
    async (req) => {
      const owner = req.session!.owner.id;
      const s = findings.get(req.params.fid);
      if (!s || s.ownerId !== owner || s.fragranceId !== req.params.id || s.expiresAt < Date.now()) throw new ApiError('NOT_FOUND', 'Research result expired; run the research again');
      const wanted = new Set<string>(req.body.fields as string[]);
      const chosen = s.proposals.filter((p) => p.value !== null && wanted.has(p.field));
      if (!chosen.length) throw new ApiError('VALIDATION_FAILED', 'None of the selected details can be saved');
      const n = await addResearchClaims(
        db(),
        req.params.id,
        { url: s.pageUrl, siteName: s.siteName, checkedAt: s.checkedAt, evidence: s.evidence, productNameOnPage: s.productNameOnPage },
        chosen.map((p) => ({ field: p.field, value: p.value })),
      );
      return { saved: n, fields: chosen.map((p) => p.field) };
    },
  );
}
