import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { RotatingPool } from '../../db/pool.js';
import { ChoicesSchema, SeasonSchema, emptyChoices, noteChoices } from '../../domain/seasons.js';
import { ApiError } from '../../errors.js';
export async function seasonRoutes(base:FastifyInstance,deps:{pool:RotatingPool}) {
  const app=base.withTypeProvider<TypeBoxTypeProvider>(); const db=()=>deps.pool.get();
  const params=Type.Object({season:SeasonSchema},{additionalProperties:false});
  app.get('/profile/seasons/:season',{schema:{params}},async req=>{
    const row=(await db().query('SELECT season,choices,liked_notes,avoided_notes,free_text FROM app.seasonal_preferences WHERE owner_id=$1 AND season=$2',[req.session!.owner.id,req.params.season])).rows[0];
    const fragrances=(await db().query("SELECT s.fragrance_id,s.affinity,f.canonical_name,b.canonical_name AS brand FROM app.season_fragrances s JOIN app.fragrances f ON f.id=s.fragrance_id JOIN app.brands b ON b.id=f.brand_id WHERE s.owner_id=$1 AND s.season=$2 AND s.affinity_origin='user' ORDER BY f.normalized_name",[req.session!.owner.id,req.params.season])).rows;
    const stats=(await db().query("SELECT state,count(*)::int AS count FROM app.collection_entries WHERE owner_id=$1 GROUP BY state",[req.session!.owner.id])).rows;
    const choices=row?.choices && Object.keys(row.choices).length ? row.choices : emptyChoices();
    if(row && !Object.keys(row.choices).length){for(const n of row.liked_notes)choices.notes[n]='love';for(const n of row.avoided_notes)choices.notes[n]='avoid';}
    return {season:req.params.season,choices,freeText:row?.free_text??null,fragrances,collectionByState:stats,explanation:'These are your explicit choices. Ownership is not a rating; an unlisted preference is not neutral.'};
  });
  app.patch('/profile/seasons/:season',{schema:{params,body:Type.Object({choices:ChoicesSchema,freeText:Type.Optional(Type.Union([Type.String({maxLength:4000}),Type.Null()]))},{additionalProperties:false})}},async req=>{
    const notes=noteChoices(req.body.choices);
    await db().query(`INSERT INTO app.seasonal_preferences (owner_id,season,choices,liked_notes,avoided_notes,free_text)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (owner_id,season) DO UPDATE SET choices=EXCLUDED.choices,liked_notes=EXCLUDED.liked_notes,avoided_notes=EXCLUDED.avoided_notes,free_text=EXCLUDED.free_text,updated_at=now()`,
      [req.session!.owner.id,req.params.season,JSON.stringify(req.body.choices),JSON.stringify(notes.liked),JSON.stringify(notes.avoided),req.body.freeText??null]);
    return {saved:true,season:req.params.season};
  });
  app.put('/profile/seasons/:season/fragrances/:id',{schema:{params:Type.Object({season:SeasonSchema,id:Type.String({format:'uuid'})},{additionalProperties:false}),body:Type.Object({affinity:Type.Union([Type.Literal('love'),Type.Literal('like'),Type.Literal('neutral'),Type.Literal('avoid'),Type.Literal('unsure'),Type.Null()])},{additionalProperties:false})}},async req=>{
    if (!(await db().query('SELECT 1 FROM app.fragrances WHERE id=$1',[req.params.id])).rowCount) throw new ApiError('NOT_FOUND','Fragrance not found');
    await db().query(`INSERT INTO app.season_fragrances (owner_id,fragrance_id,season,affinity,affinity_origin) VALUES ($1,$2,$3,$4,'user')
      ON CONFLICT (owner_id,fragrance_id,season,affinity_origin) DO UPDATE SET affinity=EXCLUDED.affinity,updated_at=now()`,[req.session!.owner.id,req.params.id,req.params.season,req.body.affinity]);
    return {saved:true};
  });
}
