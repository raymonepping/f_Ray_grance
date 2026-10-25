import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { RotatingPool } from '../src/db/pool.js';
import { loadMigrations, migrate } from '../src/db/migrate.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import { addUserClaim } from '../src/repo/enrichment.js';
import { createEntry, transitionEntry } from '../src/repo/collection.js';
import { exportBundle, transfer } from '../src/repo/portability.js';
import { checkBundle, stable, type Bundle } from '../src/domain/portability.js';
import { emptyChoices } from '../src/domain/seasons.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { runtimePool, seedOwner, sessionKey, testConfig, uniq, client, credentialsFile, silentLog, testPg, MIGRATIONS_DIR, EXPECTED_SCHEMA_VERSION } from './helpers.js';
const database=`fray_transfer_${process.pid}`;
let pool:RotatingPool;let restored:RotatingPool;let app:FastifyInstance;let owner:string;let other:string;let restoredOwner:string;let headers:Record<string,string>;let otherHeaders:Record<string,string>;let fragrance:string;let bundle:Bundle;
const {key}=sessionKey();
async function auth(id:string){const s=await createSession(pool.get(),key,id,1);return {origin:'http://localhost:8470',cookie:`${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`,'x-csrf-token':s.csrfToken};}
beforeAll(async()=>{
 pool=await runtimePool();owner=await seedOwner(pool.get());other=await seedOwner(pool.get());headers=await auth(owner);otherHeaders=await auth(other);
 app=await buildApp({config:testConfig({FRAY_IMPORT_ENABLED:'true'}),pool,key,expectedSchemaVersion:EXPECTED_SCHEMA_VERSION,logger:false});
 const brandId=await upsertBrand(pool.get(),uniq('Portability'));
 fragrance=await createFragrance(pool.get(),{brandId,name:'Synthetic seasonal fragrance',concentration:'eau_de_parfum',identityStatus:'verified'});
 await addUserClaim(pool.get(),fragrance,'pyramid',{top:['Bergamot'],heart:['Lavender'],base:['Cedar']},owner);
 await addUserClaim(pool.get(),fragrance,'character','Manual corrected canonical description',owner);
 const entry=await createEntry(pool.get(),owner,{fragranceId:fragrance,state:'sampled',rating:4,personalNote:'Original private annotation',reason:'synthetic tester'});
 await transitionEntry(pool.get(),owner,entry.id,'owned','synthetic purchase');await transitionEntry(pool.get(),owner,entry.id,'previously_owned','synthetic finished');
 await createEntry(pool.get(),other,{fragranceId:fragrance,state:'owned',personalNote:'Other owner confidential note'});
 const admin=client('postgres','postgres');await admin.connect();await admin.query(`CREATE DATABASE ${database} OWNER fray_owner`);await admin.end();
 const setup=client('postgres',database);await setup.connect();await setup.query(readFileSync(new URL('../../../ansible/roles/postgres_base/files/database.sql',import.meta.url),'utf8').replace('\\set ON_ERROR_STOP on',''));await setup.query(`GRANT CONNECT ON DATABASE ${database} TO t_migrator,t_runtime`);await setup.end();
 const migrator=client('t_migrator',database);await migrator.connect();await migrate(migrator,await loadMigrations(MIGRATIONS_DIR));await migrator.end();
 restored=new RotatingPool({...testPg(),database,credentialsFile:credentialsFile('t_runtime'),poolMax:4},silentLog);await restored.refresh();restoredOwner=await seedOwner(restored.get());
});
afterAll(async()=>{await app.close();await pool.close();await restored.close();const admin=client('postgres','postgres');await admin.connect();await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);await admin.end();});
const call=(method:'GET'|'PATCH'|'POST'|'PUT',url:string,payload?:object,h=headers)=>app.inject({method,url,headers:h,...(payload===undefined?{}:{payload})});
describe('explicit four-season preferences',()=>{
 it('retains pre-migration note choices when opening the new editor',async()=>{
  await pool.get().query("INSERT INTO app.seasonal_preferences(owner_id,season,liked_notes,avoided_notes) VALUES($1,'spring',$2,$3)",[other,JSON.stringify(['Legacy rose']),JSON.stringify(['Legacy smoke'])]);
  const profile=(await call('GET','/api/v1/profile/seasons/spring',undefined,otherHeaders)).json();
  expect(profile.choices.notes).toEqual({'Legacy rose':'love','Legacy smoke':'avoid'});
  await pool.get().query('DELETE FROM app.seasonal_preferences WHERE owner_id=$1',[other]);
 });
 it('keeps unknown distinct from neutral, supports all dimensions and scopes each owner',async()=>{
  for(const season of ['spring','summer','autumn','winter']){
   const choices=emptyChoices();choices.notes['Bergamot']='love';choices.notes['Oud']='avoid';choices.families['Wood & Root']='neutral';choices.accords['Salted mineral accord']='unsure';choices.traits['fresh']='love';
   expect((await call('PATCH',`/api/v1/profile/seasons/${season}`,{choices,freeText:`Private ${season} note`})).statusCode).toBe(200);
   const mine=(await call('GET',`/api/v1/profile/seasons/${season}`)).json();expect(mine.choices).toEqual(choices);expect(mine.choices.notes['Vanilla']).toBeUndefined();
   const theirs=(await call('GET',`/api/v1/profile/seasons/${season}`,undefined,otherHeaders)).json();expect(theirs.choices.notes).toEqual({});expect(theirs.freeText).toBeNull();
  }
  expect((await call('GET','/api/v1/profile/seasons/monsoon')).statusCode).toBe(400);
  expect((await call('PATCH','/api/v1/profile/seasons/spring',{choices:{notes:{Bergamot:'owned'},families:{},accords:{},traits:{}}})).statusCode).toBe(400);
 });
 it('ownership and preference can disagree; seasonal associations appear in Compare context',async()=>{
  expect((await call('PUT',`/api/v1/profile/seasons/winter/fragrances/${fragrance}`,{affinity:'avoid'})).statusCode).toBe(200);
  const season=(await call('GET','/api/v1/profile/seasons/winter')).json();expect(season.fragrances[0].affinity).toBe('avoid');
  const records=(await call('GET','/api/v1/collection')).json().items;expect(records[0].state).toBe('previously_owned');expect(records[0].rating).toBe(4);
 });
});
describe('versioned portability and additive restoration',()=>{
 it('export includes complete history, seasons and corrections but no other-owner notes or secrets',async()=>{
  const r=await call('GET','/api/v1/export');expect(r.statusCode).toBe(200);expect(r.headers['content-disposition']).toContain('attachment');bundle=r.json();checkBundle(bundle);
  expect(bundle.entries[0]?.personal_note).toBe('Original private annotation');expect(bundle.events).toHaveLength(3);expect(bundle.seasons).toHaveLength(4);expect(bundle.claims.some(c=>c.origin==='user')).toBe(true);
  expect(r.body).not.toContain('Other owner confidential note');for(const key of ['owner_credentials','sessions','password_hash','embedding','owner_id'])expect(r.body).not.toContain(`"${key}"`);
 });
 it('HTTP preview preserves exported nulls and is conflict-free for the unchanged owner',async()=>{
  const r=await call('POST','/api/v1/import',{bundle});expect(r.statusCode).toBe(200);expect(r.json().conflicts).toEqual([]);
  expect(r.json().counts.existingEntries).toBe(bundle.entries.length);
  const malformed=structuredClone(bundle);(malformed.entries[0] as unknown as {rating:string}).rating='4';
  expect((await call('POST','/api/v1/import',{bundle:malformed})).statusCode).toBe(400);
 });
 it('preview does not mutate; independent-database import preserves exact identities, history, notes and seasons',async()=>{
  const before=await exportBundle(restored.get(),restoredOwner);expect(before.entries).toHaveLength(0);
  const preview=await transfer(restored.get(),restoredOwner,bundle);expect(preview.applied).toBe(false);expect(preview.conflicts).toEqual([]);expect((await exportBundle(restored.get(),restoredOwner)).entries).toHaveLength(0);
  const applied=await transfer(restored.get(),restoredOwner,bundle,preview.previewHash);expect(applied.applied).toBe(true);
  const after=await exportBundle(restored.get(),restoredOwner);const {exportedAt:_,...expected}=bundle;const {exportedAt:__,...actual}=after;expect(actual).toEqual(expected);
 });
 it('reimport is idempotent; changed target or conflicts require a new review without overwriting',async()=>{
  const preview=await transfer(restored.get(),restoredOwner,bundle);expect(preview.counts.newEntries).toBe(0);expect(preview.conflicts).toEqual([]);
  const before=stable((await exportBundle(restored.get(),restoredOwner)).events);await transfer(restored.get(),restoredOwner,bundle,preview.previewHash);expect(stable((await exportBundle(restored.get(),restoredOwner)).events)).toBe(before);
  const changed=structuredClone(bundle);changed.entries[0]!.personal_note='Attempted overwrite';const conflict=await transfer(restored.get(),restoredOwner,changed);expect(conflict.conflicts.length).toBeGreaterThan(0);await expect(transfer(restored.get(),restoredOwner,changed,conflict.previewHash)).rejects.toThrow('conflicts');
  await expect(transfer(restored.get(),restoredOwner,changed,preview.previewHash)).rejects.toThrow('changed after preview');
 });
 it('invalid identities/history/version and foreign-owner collisions cannot mutate the database',async()=>{
  const before=stable((await exportBundle(restored.get(),restoredOwner)).entries);
  for(const bad of [{...bundle,version:1},{...bundle,events:[]},{...bundle,entries:[bundle.entries[0],bundle.entries[0]]}])await expect(transfer(restored.get(),restoredOwner,bad)).rejects.toThrow('Invalid portability');
  expect(stable((await exportBundle(restored.get(),restoredOwner)).entries)).toBe(before);
  const preview=await call('POST','/api/v1/import',{bundle},otherHeaders);expect(preview.statusCode).toBe(200);expect(preview.json().conflicts).toContain('Collection record identity conflicts with an existing record');
  const invalid=await call('POST','/api/v1/import',{bundle:{...bundle,version:99}});expect(invalid.statusCode).toBe(400);
 });
 it('untiered note claims round-trip through strict validation; malformed lists are refused',async()=>{
  const claim={...bundle.claims[0],id:'7a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',field_name:'listed_notes' as const,value:['Incense','Vetiver'],source_record_id:null,origin:'user' as const};
  expect(()=>checkBundle({...bundle,claims:[...bundle.claims,claim]})).not.toThrow();
  expect(()=>checkBundle({...bundle,claims:[...bundle.claims,{...claim,value:[1,2]}]})).toThrow();
  expect(()=>checkBundle({...bundle,claims:[...bundle.claims,{...claim,field_name:'signature_materials' as const,value:'Vetiver'}]})).toThrow();
 });
 it('live import guard stays closed without recovery approval; export and preview remain accessible',async()=>{
  const guarded=await buildApp({config:testConfig(),pool,key,expectedSchemaVersion:EXPECTED_SCHEMA_VERSION,logger:false});
  const preview=await guarded.inject({method:'POST',url:'/api/v1/import',headers,payload:{bundle}});expect(preview.statusCode).toBe(200);
  const apply=await guarded.inject({method:'POST',url:'/api/v1/import',headers,payload:{bundle,previewHash:preview.json().previewHash,confirm:'IMPORT INTO CURRENT OWNER'}});expect(apply.statusCode).toBe(409);expect(apply.body).toContain('independently verified recovery');await guarded.close();
 });
});
