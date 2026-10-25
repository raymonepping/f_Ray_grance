import type pg from 'pg';
import { ApiError } from '../errors.js';
import { type Bundle, checkBundle, digest, stable } from '../domain/portability.js';
import { emptyChoices } from '../domain/seasons.js';
import { writePyramid } from './enrichment.js';
type Db=pg.Pool|pg.PoolClient;
const rows=async <T>(db:Db,sql:string,args:unknown[]=[]) => (await db.query<{record:T}>(sql,args)).rows.map(r=>r.record);
export async function exportBundle(db:Db,owner:string):Promise<Bundle> {
  const ids=(await db.query<{id:string}>(`SELECT DISTINCT fragrance_id AS id FROM app.collection_entries WHERE owner_id=$1
    UNION SELECT fragrance_id FROM app.season_fragrances WHERE owner_id=$1
    UNION SELECT fragrance_id FROM app.source_claims WHERE origin='user' AND corrected_by_owner=$1`,[owner])).rows.map(r=>r.id);
  const fragrances=await rows<Bundle['fragrances'][number]>(db,`SELECT jsonb_build_object('id',f.id,'brand',b.canonical_name,'canonical_name',f.canonical_name,'flanker',f.flanker,'concentration',f.concentration,'formulation_revision',f.formulation_revision,'launch_year',f.launch_year,'identity_status',f.identity_status) AS record FROM app.fragrances f JOIN app.brands b ON b.id=f.brand_id WHERE f.id=ANY($1::uuid[]) ORDER BY f.id`,[ids]);
  const variants=await rows<Bundle['variants'][number]>(db,'SELECT to_jsonb(v) AS record FROM app.product_variants v WHERE fragrance_id=ANY($1::uuid[]) ORDER BY id',[ids]);
  const claims=await rows<Bundle['claims'][number]>(db,"SELECT to_jsonb(c)-'corrected_by_owner' AS record FROM app.source_claims c WHERE fragrance_id=ANY($1::uuid[]) ORDER BY claimed_at,id",[ids]);
  const sourceIds=[...new Set(claims.flatMap(c=>c.source_record_id?[c.source_record_id]:[]))];
  const sources=await rows<Bundle['sources'][number]>(db,'SELECT to_jsonb(s) AS record FROM app.source_records s WHERE id=ANY($1::uuid[]) ORDER BY id',[sourceIds]);
  const entries=await rows<Bundle['entries'][number]>(db,"SELECT to_jsonb(e)-'owner_id'-'client_request_id'-'updated_at' AS record FROM app.collection_entries e WHERE owner_id=$1 ORDER BY id",[owner]);
  const events=await rows<Bundle['events'][number]>(db,"SELECT to_jsonb(h)-'id'-'recorded_at' AS record FROM app.collection_events h JOIN app.collection_entries e ON e.id=h.entry_id WHERE e.owner_id=$1 ORDER BY h.id",[owner]);
  const seasons=await rows<Bundle['seasons'][number]>(db,"SELECT to_jsonb(s)-'owner_id'-'updated_at' AS record FROM app.seasonal_preferences s WHERE owner_id=$1 ORDER BY season",[owner]);
  for(const s of seasons)if(!Object.keys(s.choices).length){s.choices=emptyChoices();for(const n of s.liked_notes)s.choices.notes[n]='love';for(const n of s.avoided_notes)s.choices.notes[n]='avoid';}
  const seasonFragrances=await rows<Bundle['seasonFragrances'][number]>(db,"SELECT to_jsonb(s)-'owner_id'-'updated_at' AS record FROM app.season_fragrances s WHERE owner_id=$1 ORDER BY fragrance_id,season,affinity_origin",[owner]);
  return {format:'f-ray-grance',version:1,exportedAt:new Date().toISOString(),fragrances,variants,sources,claims,entries,events,seasons,seasonFragrances};
}
function withoutTimestamp(bundle:Bundle){const {exportedAt,...data}=bundle;return data;}
export async function transfer(pool:pg.Pool,owner:string,value:unknown,previewHash?:string) {
  try{checkBundle(value);}catch{throw new ApiError('VALIDATION_FAILED','Invalid portability file: check format, identities, provenance and complete status history');}
  const b=value; const c=await pool.connect();
  try{
    await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('fray-import:' || $1))",[owner]);
    const target=await exportBundle(c,owner); const conflicts:string[]=[];
    // Compare exact exported records. Different existing content is never overwritten.
    const groups=['fragrances','variants','sources','claims','entries'] as const;
    for(const group of groups){
      const current=new Map(target[group].map(r=>[r.id,r]));
      for(const row of b[group]){const existing=current.get(row.id);if(existing&&stable(existing)!==stable(row))conflicts.push(`${group}: existing record differs (${row.id})`);}
    }
    // An entry outside this owner's export may belong to someone else; no disclosure.
    if(b.entries.length){const foreign=await c.query('SELECT 1 FROM app.collection_entries WHERE id=ANY($1::uuid[]) AND owner_id<>$2 LIMIT 1',[b.entries.map(e=>e.id),owner]);if(foreign.rowCount)conflicts.push('Collection record identity conflicts with an existing record');}
    for(const f of b.fragrances){
      const existing=(await c.query('SELECT f.id,b.canonical_name AS brand,f.canonical_name,f.flanker,f.concentration,f.formulation_revision,f.launch_year,f.identity_status FROM app.fragrances f JOIN app.brands b ON b.id=f.brand_id WHERE f.id=$1',[f.id])).rows[0];
      if(existing&&stable(existing)!==stable(f))conflicts.push(`Existing canonical identity differs (${f.id})`);
      const collision=await c.query(`SELECT 1 FROM app.fragrances f JOIN app.brands b ON b.id=f.brand_id WHERE f.id<>$1 AND b.normalized_name=app.normalize_identity($2) AND f.normalized_name=app.normalize_identity($3) AND f.flanker IS NOT DISTINCT FROM $4 AND f.concentration IS NOT DISTINCT FROM $5 AND f.formulation_revision IS NOT DISTINCT FROM $6`,[f.id,f.brand,f.canonical_name,f.flanker,f.concentration,f.formulation_revision]);
      if(collision.rowCount)conflicts.push(`Canonical identity already has another ID (${f.id}); manual reconciliation required`);
    }
    for(const s of b.sources){
      const collision=await c.query('SELECT 1 FROM app.source_records WHERE id<>$1 AND provider=$2 AND external_id IS NOT DISTINCT FROM $3 AND response_hash IS NOT DISTINCT FROM $4',[s.id,s.provider,s.external_id,s.response_hash]);
      if(collision.rowCount)conflicts.push(`Source observation has another identity (${s.id}); manual reconciliation required`);
    }
    for(const claim of b.claims)if(claim.origin==='user'&&claim.superseded_at===null){
      const existing=(await c.query("SELECT id,value FROM app.source_claims WHERE fragrance_id=$1 AND field_name=$2 AND origin='user' AND superseded_at IS NULL",[claim.fragrance_id,claim.field_name])).rows;
      if(existing.some(x=>x.id!==claim.id&&stable(x.value)!==stable(claim.value)))conflicts.push(`Current manual correction differs (${claim.fragrance_id})`);
    }
    for(const v of b.variants)if(v.gtin14&&v.verification_state==='verified'){
      const hit=await c.query("SELECT 1 FROM app.product_variants WHERE gtin14=$1 AND verification_state='verified' AND id<>$2",[v.gtin14,v.id]);if(hit.rowCount)conflicts.push(`Verified barcode already has another record (${v.id})`);
    }
    // Global source/claim IDs may already exist outside the referenced catalog subset.
    for(const [table,incoming] of [['source_records',b.sources],['source_claims',b.claims],['product_variants',b.variants]] as const){
      if(!incoming.length)continue;
      const existing=await rows<{id:string}>(c,`SELECT ${table==='source_claims'?"to_jsonb(t)-'corrected_by_owner'":'to_jsonb(t)'} AS record FROM app.${table} t WHERE id=ANY($1::uuid[])`,[incoming.map(r=>r.id)]);
      for(const row of existing){const source=incoming.find(x=>x.id===row.id);if(stable(row)!==stable(source))conflicts.push(`Existing ${table} record differs (${row.id})`);}
    }
    for(const e of b.entries){
      const prior=target.events.filter(x=>x.entry_id===e.id);const incoming=b.events.filter(x=>x.entry_id===e.id);
      if(target.entries.some(x=>x.id===e.id)&&stable(prior)!==stable(incoming))conflicts.push(`Existing history differs (${e.id})`);
    }
    for(const h of b.events){const existing=(await c.query('SELECT entry_id FROM app.collection_events WHERE portable_id=$1',[h.portable_id])).rows[0];if(existing&&existing.entry_id!==h.entry_id)conflicts.push(`History identity collision (${h.portable_id})`);}
    for(const s of b.seasons){const old=target.seasons.find(x=>x.season===s.season);if(old&&stable(old)!==stable(s))conflicts.push(`Existing ${s.season} preferences differ`);}
    for(const s of b.seasonFragrances){const old=target.seasonFragrances.find(x=>x.fragrance_id===s.fragrance_id&&x.season===s.season&&x.affinity_origin===s.affinity_origin);if(old&&stable(old)!==stable(s))conflicts.push(`Existing seasonal association differs (${s.fragrance_id})`);}
    const hash=digest({owner,bundle:b,target:withoutTimestamp(target)});
    const preview={previewHash:hash,conflicts:[...new Set(conflicts)],counts:{newEntries:b.entries.filter(e=>!target.entries.some(x=>x.id===e.id)).length,existingEntries:b.entries.filter(e=>target.entries.some(x=>x.id===e.id)).length,historyEvents:b.events.length,seasons:b.seasons.length,manualCorrections:b.claims.filter(x=>x.origin==='user').length},target:'Current signed-in owner on this Mac',destructive:false};
    if(previewHash===undefined){await c.query('ROLLBACK');return {...preview,applied:false};}
    if(previewHash!==hash)throw new ApiError('CONFLICT','File or target changed after preview; preview again');
    if(conflicts.length)throw new ApiError('CONFLICT','Import conflicts require review; nothing was changed',{conflicts:preview.conflicts});
    async function insert(table:string,row:Record<string,unknown>,jsonColumns:string[]=[]){
      const cols=Object.keys(row);const vals=cols.map(k=>jsonColumns.includes(k)?JSON.stringify(row[k]):row[k]);
      await c.query(`INSERT INTO app.${table} (${cols.join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT DO NOTHING`,vals);
    }
    for(const f of b.fragrances){
      const brand=(await c.query<{id:string}>(`INSERT INTO app.brands(canonical_name) VALUES($1) ON CONFLICT(normalized_name) DO UPDATE SET canonical_name=app.brands.canonical_name RETURNING id`,[f.brand])).rows[0]!.id;
      const {brand:_,...row}=f;await insert('fragrances',{...row,brand_id:brand});
    }
    for(const v of b.variants)await insert('product_variants',v);
    for(const s of b.sources)await insert('source_records',s,['mapped']);
    for(const claim of b.claims){
      // An existing active correction cannot be silently displaced by a new claim.
      if(claim.origin==='user'&&claim.superseded_at===null){const old=(await c.query('SELECT id,value FROM app.source_claims WHERE fragrance_id=$1 AND field_name=$2 AND origin=\'user\' AND superseded_at IS NULL',[claim.fragrance_id,claim.field_name])).rows;if(old.some(x=>x.id!==claim.id&&stable(x.value)!==stable(claim.value)))throw new ApiError('CONFLICT','A current manual correction differs; nothing was changed');}
      const existed=(await c.query('SELECT 1 FROM app.source_claims WHERE id=$1',[claim.id])).rowCount;
      await insert('source_claims',{...claim,corrected_by_owner:claim.origin==='user'?owner:null},['value']);
      if(!existed&&claim.field_name==='pyramid')await writePyramid(c,claim.fragrance_id,claim.id,claim.value as Parameters<typeof writePyramid>[3]);
    }
    for(const e of b.entries){
      if(target.entries.some(x=>x.id===e.id))continue;
      const history=b.events.filter(h=>h.entry_id===e.id);
      for(const [i,h] of history.entries()){
        await c.query("SELECT set_config('fray.transition_reason',$1,true),set_config('fray.transition_at',$2,true),set_config('fray.transition_event_id',$3,true)",[h.user_reason??'',h.occurred_at,h.portable_id]);
        if(i===0)await insert('collection_entries',{...e,owner_id:owner,state:h.to_state});
        else await c.query('UPDATE app.collection_entries SET state=$1 WHERE id=$2 AND owner_id=$3',[h.to_state,e.id,owner]);
      }
    }
    for(const s of b.seasons)await insert('seasonal_preferences',{...s,owner_id:owner},['liked_notes','avoided_notes','liked_traits','choices']);
    for(const s of b.seasonFragrances)await insert('season_fragrances',{...s,owner_id:owner});
    await c.query('COMMIT');return {...preview,applied:true};
  }catch(err){await c.query('ROLLBACK').catch(()=>undefined);if((err as {code?:string}).code==='40001')throw new ApiError('CONFLICT','Target changed during import; preview again');throw err;}
  finally{c.release();}
}
