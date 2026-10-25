import { EXPECTED_SCHEMA_VERSION } from './helpers.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { OllamaClient, MODEL, MODEL_REVISION, DIMENSION } from '../src/providers/ollama.js';
import { candidateEvidence, embeddingInput, rankCandidate } from '../src/domain/discovery.js';
import { effectiveProfile, addUserClaim } from '../src/repo/enrichment.js';
import { createFragrance, getFragrance, upsertBrand } from '../src/repo/catalog.js';
import { createEntry } from '../src/repo/collection.js';
import { createSession, SESSION_COOKIE, CSRF_COOKIE } from '../src/security/sessions.js';
import type { RotatingPool } from '../src/db/pool.js';
import { runtimePool, seedOwner, sessionKey, testConfig, uniq } from './helpers.js';

let pool: RotatingPool; let app: FastifyInstance; let a: string; let b: string; let owner: string; let headers: Record<string,string>; let otherHeaders: Record<string,string>;
let offline = false; let badDimension = false; let badRevision = false; const inputs: string[] = [];
const { key } = sessionKey();
const fakeFetch: typeof fetch = async (url, init) => {
  if (offline) throw new TypeError('offline');
  if (String(url).endsWith('/api/tags')) return Response.json({ models: [{ name: MODEL, digest: badRevision ? 'changed' : MODEL_REVISION }] });
  const body = JSON.parse(String(init?.body)); inputs.push(body.input);
  return Response.json({ model: MODEL, embeddings: [Array.from({length: badDimension ? 12 : DIMENSION}, (_, i) => i === 0 ? 1 : 0)] });
};
async function session(id: string) { const s = await createSession(pool.get(), key, id, 1); return { origin:'http://localhost:8470', cookie:`${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, 'x-csrf-token':s.csrfToken }; }
beforeAll(async () => {
  pool = await runtimePool(); owner = await seedOwner(pool.get()); headers = await session(owner); otherHeaders = await session(await seedOwner(pool.get()));
  app = await buildApp({ config:testConfig(), pool, key, expectedSchemaVersion:EXPECTED_SCHEMA_VERSION, ollama:new OllamaClient(fakeFetch), logger:false });
  const brandId = await upsertBrand(pool.get(), uniq('Discovery'));
  a = await createFragrance(pool.get(), {brandId,name:'Positive anchor',identityStatus:'verified'});
  b = await createFragrance(pool.get(), {brandId,name:'Related candidate',identityStatus:'verified'});
  await addUserClaim(pool.get(), a, 'pyramid', {top:['Bergamot'],heart:['Lavender'],base:['Vanilla']});
  await addUserClaim(pool.get(), b, 'pyramid', {top:['Bergamot'],heart:['Lavender'],base:['Cedar']});
  await addUserClaim(pool.get(), a, 'character', 'Private canonical correction excluded from model');
  await createEntry(pool.get(), owner, {fragranceId:a,state:'owned',rating:5,personalNote:'Private annotation never embedded'});
});
afterAll(async () => { await app.close(); await pool.close(); });
const index = (id:string) => app.inject({method:'POST',url:`/api/v1/fragrances/${id}/embedding`,headers});
const discover = (h=headers, query='') => app.inject({method:'GET',url:`/api/v1/discover${query}`,headers:h});
describe('local embedding integrity and discovery', () => {
  it('observed model dimension and digest are validated before storage; private claims/notes excluded', async () => {
    expect((await index(a)).statusCode).toBe(200); expect((await index(b)).json().dimension).toBe(768);
    const row = (await pool.get().query('SELECT model_revision,dimension,input_hash,source_revision FROM app.fragrance_embeddings WHERE fragrance_id=$1',[a])).rows[0];
    expect(row.model_revision).toBe(MODEL_REVISION); expect(row.input_hash).toHaveLength(64);
    expect(inputs.join(' ')).not.toContain('Private');
    badDimension=true; expect((await index(a)).statusCode).toBe(503); badDimension=false;
    badRevision=true; expect((await index(a)).statusCode).toBe(503); badRevision=false;
    expect((await pool.get().query('SELECT model_revision FROM app.fragrance_embeddings WHERE fragrance_id=$1',[a])).rows[0].model_revision).toBe(MODEL_REVISION);
  });
  it('ranks from explicit positive ratings; a different owner has no inferred preferences', async () => {
    const r = await discover(); expect(r.statusCode).toBe(200); expect(r.json().engine).toBe('hybrid');
    const candidate = r.json().items.find((x:{fragrance:{id:string}})=>x.fragrance.id===b);
    expect(candidate.semanticRelatedness).toBeCloseTo(1); expect(candidate.reason).toContain('explicit preferences');
    expect((await discover(otherHeaders)).json().items).toEqual([]);
    expect((await discover(otherHeaders)).json().reason).toContain('ownership alone');
  });
  it('refuses stale-source vectors and mixes no model revisions', async () => {
    await pool.get().query(`WITH source AS (INSERT INTO app.source_records (provider,external_id) VALUES ('scento',$2) RETURNING id)
      INSERT INTO app.source_claims (fragrance_id,source_record_id,origin,field_name,value) SELECT $1,id,'provider','family','"New public family"' FROM source`,[b,uniq('source')]);
    const f=(await getFragrance(pool.get(),b))!; const fields=await effectiveProfile(pool.get(),b);
    const hash=embeddingInput(f,fields).hash;
    expect((await pool.get().query('SELECT input_hash FROM app.fragrance_embeddings WHERE fragrance_id=$1',[b])).rows[0].input_hash).not.toBe(hash);
    const r=(await discover()).json().items.find((x:{fragrance:{id:string}})=>x.fragrance.id===b);
    expect(r.semanticRelatedness).toBeNull();
  });
  it('Ollama outage returns structured recommendations with no semantic scores', async () => {
    offline=true;
    const r=(await discover()).json(); expect(r.engine).toBe('structured'); expect(r.reason).toContain('Ollama unavailable');
    expect(r.items.find((x:{fragrance:{id:string}})=>x.fragrance.id===b).semanticRelatedness).toBeNull();
    expect((await index(b)).statusCode).toBe(503); offline=false;
  });
  it('different mode requires fit, avoids explicit dislikes and does not rank arbitrary unrelatedness', () => {
    const anchor={id:a,notes:['bergamot','lavender'],family:'aromatic'};
    const unrelated={id:'unrelated',notes:['smoke','oud'],family:'wood'};
    const related={id:b,notes:['bergamot','cedar'],family:'aromatic'};
    expect(rankCandidate(unrelated,[anchor],[],[],'different',null).eligible).toBe(false);
    expect(rankCandidate(related,[anchor],[],[],'different',null).eligible).toBe(true);
    expect(rankCandidate(related,[anchor],[],['cedar'],'different',null).eligible).toBe(false);
    expect(candidateEvidence({id:b} as never,{}).notes).toEqual([]);
  });
  it('indexing requires authorization and discovery validates mode', async () => {
    expect((await app.inject({method:'POST',url:`/api/v1/fragrances/${a}/embedding`,headers:{origin:'http://localhost:8470'}})).statusCode).toBe(401);
    expect((await discover(headers,'?mode=random')).statusCode).toBe(400);
  });
});
