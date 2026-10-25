// Scent Academy API (Phase 11). Owner-protected (registered under requireOwner); every
// mutation is CSRF-checked globally. Reference lookups send ONLY a public concept term to
// Scento — never observations, collection state, ratings or tutor questions.
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { EXPLAIN, ExerciseStatus, GLOSSARY, LESSONS, ProgressStatus, Stage, lessonFor } from '../../domain/academy.js';
import { ApiError } from '../../errors.js';
import { SourceError, type EducationalKind, type ScentoClient } from '../../providers/scento.js';
import type { OllamaClient } from '../../providers/ollama.js';
import type { RotatingPool } from '../../db/pool.js';

const Obj = <T extends Parameters<typeof Type.Object>[0]>(p: T) => Type.Object(p, { additionalProperties: false });
const Id = Type.String({ format: 'uuid' });
const SlugParams = Obj({ slug: Type.String({ pattern: '^[a-z-]{1,80}$' }) });
const Term = Type.String({ minLength: 1, maxLength: 80, pattern: "^[A-Za-z0-9 &'-]+$" });
const RefKind = Type.Union(['material', 'term', 'family', 'families', 'journal'].map((k) => Type.Literal(k)));

export async function academyRoutes(base: FastifyInstance, deps: { pool: RotatingPool; scento: ScentoClient; ollama: OllamaClient }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();
  // Per-owner budget for provider-backed and tutor calls (on top of the client's own bucket).
  const perOwner = (max: number) => ({
    rateLimit: { max, timeWindow: '1 minute', keyGenerator: (req: { session?: { owner: { id: string } } | null; ip: string }) => req.session?.owner.id ?? req.ip },
  });

  async function reference(kind: EducationalKind, term: string) {
    try {
      return { available: true as const, reference: await deps.scento.educational(kind, term) };
    } catch (e) {
      if (!(e instanceof SourceError)) throw e;
      return {
        available: false as const,
        code: e.code,
        retryAfterSeconds: e.retryAfterSeconds ?? null,
        message: 'The source reference is unavailable. Your lessons and private practice remain available.',
      };
    }
  }

  app.get('/academy/lessons', async (req) => ({
    lessons: LESSONS,
    progress: (
      await db().query('SELECT lesson_slug, content_version, status, position FROM app.academy_progress WHERE owner_id = $1 ORDER BY lesson_slug', [req.session!.owner.id])
    ).rows,
    authorship: 'Original F-Ray-grance lessons, content version 1; educational descriptions, not performance measurements.',
  }));

  app.get('/academy/glossary', async () => ({ glossary: GLOSSARY, explain: EXPLAIN }));

  app.patch(
    '/academy/lessons/:slug/progress',
    { schema: { params: SlugParams, body: Obj({ status: ProgressStatus, position: Type.Integer({ minimum: 0, maximum: 20 }), contentVersion: Type.Integer({ minimum: 1 }) }) } },
    async (req) => {
      const l = lessonFor(req.params.slug);
      if (!l) throw new ApiError('NOT_FOUND', 'Lesson not found');
      if (l.version !== req.body.contentVersion || req.body.position >= l.sections.length) {
        throw new ApiError('CONFLICT', 'Lesson version or resume position changed; reload the lesson');
      }
      await db().query(
        `INSERT INTO app.academy_progress (owner_id, lesson_slug, content_version, status, position) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (owner_id, lesson_slug, content_version) DO UPDATE SET status = EXCLUDED.status, position = EXCLUDED.position`,
        [req.session!.owner.id, l.slug, l.version, req.body.status, req.body.position],
      );
      return { saved: true };
    },
  );

  app.get('/academy/practice', async (req) => ({
    exercises: (
      await db().query(
        `SELECT x.id, x.entry_id, x.title, x.status, x.created_at, f.canonical_name AS fragrance, b.canonical_name AS brand,
                CASE WHEN f.id IS NULL THEN NULL ELSE app.primary_image(x.owner_id, f.id, NULL) END AS primary_image_id,
                (SELECT count(*)::int FROM app.training_observations o WHERE o.exercise_id = x.id) AS observations
           FROM app.training_exercises x
           LEFT JOIN app.collection_entries e ON e.id = x.entry_id
           LEFT JOIN app.fragrances f ON f.id = e.fragrance_id
           LEFT JOIN app.brands b ON b.id = f.brand_id
          WHERE x.owner_id = $1 ORDER BY x.created_at DESC, x.id LIMIT 100`,
        [req.session!.owner.id],
      )
    ).rows,
  }));

  app.post('/academy/practice', { schema: { body: Obj({ entryId: Type.Optional(Id), title: Type.String({ minLength: 1, maxLength: 100 }) }) } }, async (req, reply) => {
    // Only this owner's owned/sampled entry can be attached; another owner's id behaves as missing.
    const r = await db().query(
      `INSERT INTO app.training_exercises (owner_id, entry_id, title)
       SELECT $1, $2, $3 WHERE $2::uuid IS NULL
          OR EXISTS (SELECT 1 FROM app.collection_entries WHERE id = $2 AND owner_id = $1 AND state IN ('owned', 'sampled'))
       RETURNING id, entry_id, title, status, created_at`,
      [req.session!.owner.id, req.body.entryId ?? null, req.body.title.trim()],
    );
    if (!r.rowCount) throw new ApiError('NOT_FOUND', 'Choose your own owned fragrance or sample');
    return reply.code(201).send(r.rows[0]);
  });

  app.get('/academy/practice/:id', { schema: { params: Obj({ id: Id }) } }, async (req) => {
    const e = (
      await db().query('SELECT id, entry_id, title, status, created_at FROM app.training_exercises WHERE id = $1 AND owner_id = $2', [req.params.id, req.session!.owner.id])
    ).rows[0];
    if (!e) throw new ApiError('NOT_FOUND', 'Practice exercise not found');
    const observations = (
      await db().query('SELECT id, exercise_id, stage, elapsed_minutes, descriptors, free_text FROM app.training_observations WHERE exercise_id = $1 ORDER BY elapsed_minutes, id', [e.id])
    ).rows;
    return { exercise: e, observations };
  });

  app.patch('/academy/practice/:id', { schema: { params: Obj({ id: Id }), body: Obj({ status: ExerciseStatus }) } }, async (req) => {
    const r = await db().query('UPDATE app.training_exercises SET status = $1 WHERE id = $2 AND owner_id = $3 RETURNING id', [req.body.status, req.params.id, req.session!.owner.id]);
    if (!r.rowCount) throw new ApiError('NOT_FOUND', 'Practice exercise not found');
    return { saved: true };
  });

  app.put(
    '/academy/practice/:id/observations/:stage',
    {
      schema: {
        params: Obj({ id: Id, stage: Stage }),
        body: Obj({
          elapsedMinutes: Type.Integer({ minimum: 0, maximum: 1440 }),
          descriptors: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 20 }),
          text: Type.String({ maxLength: 4000 }),
        }),
      },
    },
    async (req) => {
      const r = await db().query(
        `INSERT INTO app.training_observations (exercise_id, stage, elapsed_minutes, descriptors, free_text)
         SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM app.training_exercises WHERE id = $1 AND owner_id = $6 AND status = 'active')
         ON CONFLICT (exercise_id, stage) DO UPDATE SET elapsed_minutes = EXCLUDED.elapsed_minutes, descriptors = EXCLUDED.descriptors, free_text = EXCLUDED.free_text
         RETURNING id`,
        [req.params.id, req.params.stage, req.body.elapsedMinutes, JSON.stringify(req.body.descriptors.map((d) => d.trim()).filter(Boolean)), req.body.text, req.session!.owner.id],
      );
      if (!r.rowCount) throw new ApiError('NOT_FOUND', 'Active practice exercise not found; resume it to save');
      return { saved: true, id: r.rows[0].id };
    },
  );

  app.get(
    '/academy/reference',
    { config: perOwner(15), schema: { querystring: Obj({ kind: RefKind, term: Type.Optional(Term) }) } },
    async (req) => {
      if (req.query.kind !== 'families' && !req.query.term) throw new ApiError('VALIDATION_FAILED', 'A term is required for this reference');
      return reference(req.query.kind as EducationalKind, req.query.term ?? '');
    },
  );

  app.post(
    '/academy/tutor',
    {
      config: perOwner(6),
      schema: {
        body: Obj({
          lesson: Type.String({ pattern: '^[a-z-]{1,80}$' }),
          question: Type.String({ minLength: 1, maxLength: 600 }),
          reference: Type.Optional(Obj({ kind: RefKind, term: Term })),
        }),
      },
    },
    async (req) => {
      const l = lessonFor(req.body.lesson);
      if (!l) throw new ApiError('NOT_FOUND', 'Lesson not found');
      const lessonText = [l.title, l.intro, ...l.sections.map((s) => `${s.title}: ${s.text}`)].join('\n');
      const sources: { label: string; url: string | null }[] = [{ label: `Original lesson: ${l.title}`, url: `/academy/lessons/${l.slug}` }];
      let context = lessonText;
      // Only an explicitly requested PUBLIC reference is added; private practice is never retrieved.
      if (req.body.reference) {
        const ref = await reference(req.body.reference.kind as EducationalKind, req.body.reference.term);
        if (ref.available) {
          context += `\n\nReference (${ref.reference.attribution}): ${ref.reference.lede}\n${ref.reference.facts.map((f) => `${f.label}: ${f.value}`).join('\n')}`;
          sources.push({ label: `${ref.reference.title}. ${ref.reference.attribution}`, url: ref.reference.sourceUrl });
        }
      }
      const result = await deps.ollama.explain(req.body.question, context);
      return {
        ...result,
        curated: l.sections.map((s) => s.text).join('\n\n'),
        sources,
        notice: result.available
          ? 'Generated by a local model from the lesson text; an interpretation, not a provider-certified fact. Private practice notes are not used.'
          : 'No local generative model is configured, so here is the lesson explanation instead. No answer was generated.',
      };
    },
  );
}
