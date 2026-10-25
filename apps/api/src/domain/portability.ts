import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { createHash } from 'node:crypto';
import { ChoicesSchema, SeasonSchema } from './seasons.js';
import { COLLECTION_STATES } from './identity.js';
import { normalizeGtin } from './gtin.js';
import { AcademyDataSchema, validateAcademy } from './academy.js';
const Obj = <T extends Parameters<typeof Type.Object>[0]>(props:T) => Type.Object(props,{additionalProperties:false});
const Id=Type.String({format:'uuid'}); const Text=Type.String({maxLength:4000}); const Short=Type.String({maxLength:120});
const Null=<T extends Parameters<typeof Type.Union>[0][number]>(t:T)=>Type.Union([t,Type.Null()]);
const Time=Type.String({format:'date-time'}); const State=Type.Enum(COLLECTION_STATES);
const NoteList=Null(Type.Array(Type.String({minLength:1,maxLength:80}),{maxItems:30}));
const Pyramid=Obj({top:NoteList,heart:NoteList,base:NoteList});
export const BundleSchema=Obj({
  format:Type.Literal('f-ray-grance'),version:Type.Union([Type.Literal(1),Type.Literal(2)]),exportedAt:Time,
  fragrances:Type.Array(Obj({id:Id,brand:Short,canonical_name:Short,flanker:Null(Short),concentration:Null(Short),formulation_revision:Null(Short),launch_year:Null(Type.Integer({minimum:1700,maximum:2100})),identity_status:Type.Union([Type.Literal('verified'),Type.Literal('draft'),Type.Literal('needs_review')])}),{maxItems:1000}),
  variants:Type.Array(Obj({id:Id,fragrance_id:Id,gtin14:Null(Type.String({pattern:'^[0-9]{14}$'})),raw_barcode:Null(Short),bottle_ml:Null(Type.Number({exclusiveMinimum:0,maximum:5000})),packaging_type:Null(Short),verification_state:Type.Union([Type.Literal('verified'),Type.Literal('unverified'),Type.Literal('rejected')]),verified_source:Null(Text),created_at:Time}),{maxItems:3000}),
  sources:Type.Array(Obj({id:Id,provider:Type.Enum(['scento','manufacturer','manual','derived'] as const),external_id:Null(Short),source_url:Null(Type.String({pattern:'^https://',maxLength:2000})),attribution:Null(Text),checked_at:Time,response_hash:Null(Type.String({pattern:'^[0-9a-f]{64}$'})),permitted_cache_class:Type.Enum(['user_lookup','reference','none'] as const),mapped:Type.Record(Type.String(),Type.Unknown())}),{maxItems:5000}),
  claims:Type.Array(Obj({id:Id,fragrance_id:Id,source_record_id:Null(Id),origin:Type.Enum(['user','official','provider','derived'] as const),field_name:Type.Enum(['identity','concentration','family','subfamily','pyramid','listed_notes','signature_materials','character','character_words','wears','launch_year'] as const),value:Type.Unknown(),claimed_at:Time,superseded_at:Null(Time)}),{maxItems:20000}),
  entries:Type.Array(Obj({id:Id,fragrance_id:Id,variant_id:Null(Id),state:State,rating:Null(Type.Integer({minimum:1,maximum:5})),personal_note:Null(Text),acquired_on:Null(Type.String({format:'date'})),created_at:Time}),{maxItems:3000}),
  events:Type.Array(Obj({portable_id:Id,entry_id:Id,from_state:Null(State),to_state:State,occurred_at:Time,user_reason:Null(Type.String({maxLength:1000}))}),{maxItems:20000}),
  seasons:Type.Array(Obj({season:SeasonSchema,liked_notes:Type.Array(Short,{maxItems:100}),avoided_notes:Type.Array(Short,{maxItems:100}),liked_traits:Type.Record(Type.String(),Type.Unknown()),free_text:Null(Text),choices:ChoicesSchema}),{maxItems:4}),
  seasonFragrances:Type.Array(Obj({fragrance_id:Id,season:SeasonSchema,affinity:Null(Type.Enum(['love','like','neutral','avoid','unsure'] as const)),affinity_origin:Type.Union([Type.Literal('user'),Type.Literal('provider_editorial')])}),{maxItems:4000}),
  // Version 2 (Phase 11): Scent Academy progress and private practice. Version 1 files have none.
  academy:Type.Optional(AcademyDataSchema),
});
export type Bundle=Static<typeof BundleSchema>;
export function stable(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest=(value:unknown)=>createHash('sha256').update(stable(value)).digest('hex');
export function checkBundle(value:unknown): asserts value is Bundle {
  if(!Value.Check(BundleSchema,value))throw new Error('Invalid portability structure or unsupported format version');
  const b=value;
  for(const rows of [b.fragrances,b.variants,b.sources,b.claims,b.entries])if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicate record identities');
  if(new Set(b.events.map(e=>e.portable_id)).size!==b.events.length)throw new Error('Duplicate history identities');
  if(new Set(b.seasons.map(s=>s.season)).size!==b.seasons.length)throw new Error('Duplicate season');
  if(new Set(b.seasonFragrances.map(s=>`${s.fragrance_id}:${s.season}:${s.affinity_origin}`)).size!==b.seasonFragrances.length)throw new Error('Duplicate seasonal association');
  const fragrances=new Set(b.fragrances.map(f=>f.id)); const entries=new Set(b.entries.map(e=>e.id)); const sources=new Set(b.sources.map(s=>s.id));
  const variants=new Map(b.variants.map(v=>[v.id,v]));
  for(const v of b.variants){if(!fragrances.has(v.fragrance_id))throw new Error('Variant has no fragrance');if(v.gtin14&&!normalizeGtin(v.gtin14).ok)throw new Error('Invalid barcode');if(v.verification_state==='verified'&&(!v.gtin14||!v.verified_source))throw new Error('Unverified barcode claim');}
  for(const c of b.claims){
    if(!fragrances.has(c.fragrance_id)||(c.source_record_id&&!sources.has(c.source_record_id))||(['provider','official'].includes(c.origin)&&!c.source_record_id))throw new Error('Claim lacks provenance');
    const val=c.value;
    if(c.field_name==='pyramid'&&!Value.Check(Pyramid,val))throw new Error('Invalid note pyramid');
    if(['family','subfamily','character'].includes(c.field_name)&&!(typeof val==='string'&&val.length<=4000))throw new Error('Invalid text claim');
    if(c.field_name==='character_words'&&!(Array.isArray(val)&&val.every(x=>typeof x==='string')))throw new Error('Invalid descriptor list');
    if((c.field_name==='listed_notes'||c.field_name==='signature_materials')&&!(Array.isArray(val)&&val.length<=200&&val.every(x=>typeof x==='string'&&x.length<=200)))throw new Error('Invalid note list');
    if(c.field_name==='wears'&&!(val&&typeof val==='object'&&['seasons','hours'].every(k=>Array.isArray((val as Record<string,unknown>)[k])&&((val as Record<string,string[]>)[k]!).every(x=>typeof x==='string'))))throw new Error('Invalid wear suggestion');
    if(c.field_name==='launch_year'&&!(typeof val==='number'&&Number.isInteger(val)&&val>=1700&&val<=2100))throw new Error('Invalid year');
    if(c.field_name==='identity'&&!(val&&typeof val==='object'&&typeof (val as {name?:unknown}).name==='string'&&typeof (val as {house?:unknown}).house==='string'))throw new Error('Invalid identity claim');
    if(c.field_name==='concentration'&&!(typeof val==='string'||(val&&typeof val==='object'&&'raw' in val&&'normalized' in val)))throw new Error('Invalid concentration claim');
  }
  for(const e of b.entries){
    if(!fragrances.has(e.fragrance_id)||(e.variant_id&&variants.get(e.variant_id)?.fragrance_id!==e.fragrance_id))throw new Error('Entry identity or variant mismatch');
    const events=b.events.filter(x=>x.entry_id===e.id); let previous:string|null=null;
    if(!events.length)throw new Error('Entry has no history');
    for(const event of events){if(event.from_state!==previous||event.from_state===event.to_state)throw new Error('Broken status history');previous=event.to_state;}
    if(previous!==e.state)throw new Error('History does not end in entry status');
  }
  for(const e of b.events)if(!entries.has(e.entry_id))throw new Error('Orphan history');
  for(const s of b.seasonFragrances)if(!fragrances.has(s.fragrance_id))throw new Error('Unknown seasonal fragrance');
  if(b.version===1&&b.academy)throw new Error('Version 1 files cannot carry Academy data');
  if(b.academy)validateAcademy(b.academy,entries);
}
