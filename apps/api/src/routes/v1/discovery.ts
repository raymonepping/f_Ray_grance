import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import { getFragrance, searchFragrances } from '../../repo/catalog.js';
import { effectiveProfile } from '../../repo/enrichment.js';
import { candidateEvidence, embeddingInput, INPUT_REVISION, rankCandidate } from '../../domain/discovery.js';
import { OllamaClient, MODEL, MODEL_REVISION, DIMENSION } from '../../providers/ollama.js';
import type { RotatingPool } from '../../db/pool.js';
import { emptyChoices, type Choices } from '../../domain/seasons.js';
import { deriveDna, noteKey } from '../../domain/dna.js';

export async function discoveryRoutes(base: FastifyInstance, deps: { pool: RotatingPool; ollama: OllamaClient }) {
  const app = base.withTypeProvider<TypeBoxTypeProvider>(); const db = () => deps.pool.get();
  app.post('/fragrances/:id/embedding', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } }, schema: { params: Type.Object({ id: Type.String({ format: 'uuid' }) }, { additionalProperties: false }) } }, async (req) => {
    const f = await getFragrance(db(), req.params.id);
    if (!f) throw new ApiError('NOT_FOUND', 'Fragrance not found');
    if (f.identity_status !== 'verified') throw new ApiError('CONFLICT', 'Verify this fragrance before indexing');
    const source = embeddingInput(f, await effectiveProfile(db(), f.id));
    let vector: number[];
    try { vector = await deps.ollama.embed(source.text); } catch { throw new ApiError('DEPENDENCY_UNAVAILABLE', 'Local embedding service unavailable or model changed; stored DNA remains usable'); }
    const current = embeddingInput(f, await effectiveProfile(db(), f.id));
    if (current.hash !== source.hash) throw new ApiError('CONFLICT', 'Source changed during indexing; retry');
    await db().query(`INSERT INTO app.fragrance_embeddings (fragrance_id,model_id,model_revision,dimension,source_revision,input_hash,embedding)
      VALUES ($1,$2,$3,$4,$5,$6,$7::vector) ON CONFLICT (fragrance_id,model_id,model_revision) DO UPDATE SET
      source_revision=EXCLUDED.source_revision,input_hash=EXCLUDED.input_hash,embedding=EXCLUDED.embedding,generated_at=now()`,
      [f.id, MODEL, MODEL_REVISION, DIMENSION, INPUT_REVISION, source.hash, JSON.stringify(vector)]);
    return { indexed: true, model: MODEL, revision: MODEL_REVISION, dimension: DIMENSION, inputHash: source.hash };
  });
  app.get('/discover', { schema: { querystring: Type.Object({
    mode: Type.Optional(Type.Union([Type.Literal('similar'), Type.Literal('different')], { default: 'similar' })),
    season: Type.Optional(Type.Enum(['spring', 'summer', 'autumn', 'winter'] as const)),
  }, { additionalProperties: false }) } }, async (req) => {
    const owner = req.session!.owner.id; const mode = req.query.mode ?? 'similar';
    const likedRows = await db().query<{ fragrance_id: string }>(`SELECT DISTINCT fragrance_id FROM app.collection_entries WHERE owner_id=$1 AND rating >= 4 AND state <> 'rejected'
      UNION SELECT fragrance_id FROM app.season_fragrances WHERE owner_id=$1 AND affinity_origin='user' AND affinity IN ('love','like') AND ($2::text IS NULL OR season=$2)`, [owner, req.query.season ?? null]);
    const prefs = req.query.season ? (await db().query<{ liked_notes: string[]; avoided_notes: string[];choices:Choices }>('SELECT liked_notes,avoided_notes,choices FROM app.seasonal_preferences WHERE owner_id=$1 AND season=$2', [owner, req.query.season])).rows[0] : undefined;
    const choices={...emptyChoices(),...prefs?.choices};
    const names=(group:Record<string,string>,affinity:string)=>Object.entries(group).filter(([,a])=>a===affinity).map(([n])=>noteKey(n));
    const liked = [...(prefs?.liked_notes??[]),...names(choices.accords,'love')]; const avoided = [...(prefs?.avoided_notes??[]),...names(choices.accords,'avoid')];
    const lovedFamilies=names(choices.families,'love');const avoidedFamilies=names(choices.families,'avoid');const lovedTraits=names(choices.traits,'love');const avoidedTraits=names(choices.traits,'avoid');
    if (!likedRows.rows.length && !liked.length&&!lovedFamilies.length&&!lovedTraits.length) return { items: [], mode, engine: 'structured', reason: 'Not enough explicit preferences yet. Rate a fragrance positively or choose seasonal likes; ownership alone does not imply liking.' };
    const anchors = await Promise.all(likedRows.rows.slice(0, 100).map(async r => {
      const f = await getFragrance(db(), r.fragrance_id); return f ? { f, fields: await effectiveProfile(db(), f.id) } : null;
    }));
    const usable = anchors.filter((a): a is NonNullable<typeof a> => a !== null && a.f.identity_status === 'verified');
    const candidates = (await searchFragrances(db(), '', 100, 0)).filter(f => f.identity_status === 'verified');
    const excluded = new Set((await db().query<{ fragrance_id: string }>("SELECT fragrance_id FROM app.collection_entries WHERE owner_id=$1 AND (state IN ('owned','rejected') OR rating<=2) UNION SELECT fragrance_id FROM app.season_fragrances WHERE owner_id=$1 AND affinity_origin='user' AND affinity='avoid' AND ($2::text IS NULL OR season=$2)", [owner, req.query.season ?? null])).rows.map(r => r.fragrance_id));
    let online = true; try { await deps.ollama.verify(); } catch { online = false; }
    const items = [];
    for (const f of candidates) {
      if (excluded.has(f.id) || usable.some(a => a.f.id === f.id)) continue;
      const fields = await effectiveProfile(db(), f.id); const source = embeddingInput(f, fields);
      const family=typeof fields.family?.value==='string'?noteKey(fields.family.value):'';
      const expressed=deriveDna(fields).traits.filter(t=>t.score!==null&&t.score>=3).map(t=>t.code);
      if(avoidedFamilies.includes(family)||expressed.some(t=>avoidedTraits.includes(t)))continue;
      const extraFit=lovedFamilies.includes(family)||expressed.some(t=>lovedTraits.includes(t))?0.25:0;
      let semantic: number | null = null;
      if (online && usable.length) {
        const validAnchors = usable.map(a => ({ id: a.f.id, hash: embeddingInput(a.f, a.fields).hash }));
        const result = await db().query<{ distance: number }>(`SELECT min(c.embedding <=> a.embedding) AS distance FROM app.fragrance_embeddings c JOIN app.fragrance_embeddings a
          ON a.model_id=c.model_id AND a.model_revision=c.model_revision AND a.dimension=c.dimension
          JOIN jsonb_to_recordset($5::jsonb) AS current_anchor(id uuid, hash text) ON a.fragrance_id=current_anchor.id AND a.input_hash=current_anchor.hash
          WHERE c.fragrance_id=$1 AND c.model_id=$2 AND c.model_revision=$3 AND c.dimension=768 AND c.input_hash=$4 AND c.source_revision=$6 AND a.source_revision=$6`,
          [f.id, MODEL, MODEL_REVISION, source.hash, JSON.stringify(validAnchors), INPUT_REVISION]);
        const distance = result.rows[0]?.distance;
        if (typeof distance === 'number' && Number.isFinite(distance)) semantic = 1 - distance;
      }
      const ranked = rankCandidate(candidateEvidence(f, fields), usable.map(a => candidateEvidence(a.f, a.fields)), liked, avoided, mode, semantic,extraFit);
      if (ranked.eligible) items.push({ fragrance: f, ...ranked });
    }
    items.sort((a, b) => b.rank - a.rank || a.fragrance.id.localeCompare(b.fragrance.id));
    return { items: items.slice(0, 20), mode, engine: items.some(i => i.semanticRelatedness !== null) ? 'hybrid' : 'structured', model: MODEL, revision: MODEL_REVISION,
      reason: online ? 'Ranked from explicit ratings and seasonal choices; vectors are used only when current and compatible.' : 'Ollama unavailable: source-listed note and family rules remain available. No semantic scores were invented.',
      limitation: 'Ranking is an uncalibrated recommendation heuristic. Semantic relatedness measures descriptor text, not smell equivalence. Searches use at most 100 saved catalog identities.' };
  });
}
