import { Type, type TSchema } from 'typebox';
import { Value } from 'typebox/value';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { RotatingPool } from '../../db/pool.js';
import { BundleSchema } from '../../domain/portability.js';
import { exportBundle, transfer } from '../../repo/portability.js';
import { ApiError } from '../../errors.js';
export async function portabilityRoutes(base:FastifyInstance,deps:{pool:RotatingPool;importEnabled:boolean}) {
  // Portability must preserve exact JSON values: coercion changes nulls into
  // empty strings in nullable unions and breaks identity/history comparison.
  base.setValidatorCompiler(({schema}) => data => Value.Check(schema as TSchema,data)
    ? {value:data} : {error:new ApiError('VALIDATION_FAILED','Invalid portability request')});
  const app=base.withTypeProvider<TypeBoxTypeProvider>();
  app.get('/export',async(req,reply)=>{
    const c=await deps.pool.get().connect();
    try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const bundle=await exportBundle(c,req.session!.owner.id);await c.query('COMMIT');return reply.header('content-disposition','attachment; filename="f-ray-grance-export.json"').send(bundle);}
    catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  app.post('/import',{bodyLimit:4*1024*1024,config:{rateLimit:{max:10,timeWindow:'1 minute'}},schema:{body:Type.Object({bundle:BundleSchema,previewHash:Type.Optional(Type.String({pattern:'^[0-9a-f]{64}$'})),confirm:Type.Optional(Type.Literal('IMPORT INTO CURRENT OWNER'))},{additionalProperties:false})}},async req=>{
    if(req.body.previewHash&&req.body.confirm!=='IMPORT INTO CURRENT OWNER')throw new ApiError('VALIDATION_FAILED','Explicit import confirmation is required');
    if(req.body.previewHash&&!deps.importEnabled)throw new ApiError('CONFLICT','Import remains disabled until independently verified recovery is recorded. Preview and export are available.');
    return transfer(deps.pool.get(),req.session!.owner.id,req.body.bundle,req.body.previewHash);
  });
}
