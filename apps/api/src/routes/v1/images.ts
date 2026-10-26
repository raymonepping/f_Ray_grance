// Perfume images API (Phase 12). Owner-protected (registered under requireOwner) and CSRF-checked on
// every mutation. Images belong to the owner who attached them; another owner's image id behaves as
// missing. Binaries are served only through these routes, never from a public path.
import { createReadStream } from 'node:fs';
import { Type } from 'typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import type { RotatingPool } from '../../db/pool.js';
import { ImageError } from '../../images/errors.js';
import { processImage } from '../../images/process.js';
import type { ImageSources, SourceKind } from '../../images/sources.js';
import type { AssetStore } from '../../images/store.js';
import sharp from 'sharp';
import { fetchImage as defaultFetchImage, type FetchOptions } from '../../images/net.js';
import { namesExactly } from '../../domain/research.js';
import { CandidateStore, lookupBarcode, publicCandidate, searchImageCandidates, type Candidate } from '../../images/lookup.js';
import { TinyFishError, type TinyFishClient } from '../../providers/tinyfish.js';

const Obj = <T extends Parameters<typeof Type.Object>[0]>(p: T) => Type.Object(p, { additionalProperties: false });
const Uuid = Type.String({ format: 'uuid' });
const Label = Type.String({ minLength: 1, maxLength: 200 });
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface Row {
  id: string;
  owner_id: string;
  fragrance_id: string;
  variant_id: string | null;
  source_kind: SourceKind;
  source_ref: string | null;
  attribution_label: string;
  license_notes: string | null;
  storage_kind: string;
  storage_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  checksum: string | null;
  status: 'pending' | 'available' | 'failed' | 'rejected';
  failure_code: string | null;
  failure_detail: string | null;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
  last_verified_at: Date | null;
}

export function publicImage(r: Row, effectivePrimary: string | null) {
  return {
    id: r.id,
    fragranceId: r.fragrance_id,
    variantId: r.variant_id,
    sourceKind: r.source_kind,
    sourceRef: r.source_ref,
    attribution: r.attribution_label,
    licenseNotes: r.license_notes,
    storageKind: r.storage_kind,
    mimeType: r.mime_type,
    width: r.width,
    height: r.height,
    byteSize: r.byte_size,
    checksum: r.checksum,
    status: r.status,
    failureCode: r.failure_code,
    failureDetail: r.failure_detail,
    isPrimary: r.is_primary,
    effectivePrimary: r.id === effectivePrimary,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    lastVerifiedAt: r.last_verified_at?.toISOString() ?? null,
    url: r.status === 'available' ? `/api/v1/images/${r.id}/display` : null,
  };
}

export interface ImageLookupDeps {
  tinyfish: TinyFishClient;
  candidates?: CandidateStore;
  /** Image downloader (injectable for tests); always called with the candidate's own host only. */
  fetchImage?: (url: string, opts: FetchOptions) => Promise<{ bytes: Buffer; finalUrl: string }>;
  /** HTTP client for the Open Beauty Facts product API (injectable for tests). */
  http?: typeof fetch;
}

export async function imageRoutes(base: FastifyInstance, deps: { pool: RotatingPool; sources: ImageSources; store: AssetStore } & ImageLookupDeps): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();
  const candidates = deps.candidates ?? new CandidateStore();
  const download = deps.fetchImage ?? defaultFetchImage;
  const previews = new Map<string, Buffer>();
  const fromCandidate = (c: Candidate) => download(c.imageUrl, { allowedHosts: [new URL(c.imageUrl).hostname], maxBytes: 10 * 1024 * 1024, timeoutMs: 10_000 });

  // Raw image bodies only on the upload route (everything else stays JSON with the 64 KB limit).
  app.addContentTypeParser(UPLOAD_TYPES, { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES }, (_req, body, done) => done(null, body));

  async function context(owner: string, fragranceId: string, variantId: string | null | undefined) {
    const f = await db().query('SELECT 1 FROM app.fragrances WHERE id = $1', [fragranceId]);
    if (!f.rowCount) throw new ApiError('NOT_FOUND', 'Fragrance not found');
    if (variantId) {
      const v = await db().query('SELECT 1 FROM app.product_variants WHERE id = $1 AND fragrance_id = $2', [variantId, fragranceId]);
      if (!v.rowCount) throw new ApiError('VALIDATION_FAILED', 'That size/barcode belongs to a different fragrance');
    }
    void owner;
  }

  async function effective(owner: string, fragranceId: string, variantId: string | null): Promise<string | null> {
    const { rows } = await db().query<{ id: string | null }>('SELECT app.primary_image($1, $2, $3) AS id', [owner, fragranceId, variantId]);
    return rows[0]?.id ?? null;
  }

  async function owned(owner: string, id: string): Promise<Row> {
    const { rows } = await db().query<Row>('SELECT * FROM app.image_assets WHERE id = $1 AND owner_id = $2', [id, owner]);
    if (!rows[0]) throw new ApiError('NOT_FOUND', 'Image not found');
    return rows[0];
  }

  async function setPrimary(owner: string, row: Row) {
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `UPDATE app.image_assets SET is_primary = false
          WHERE owner_id = $1 AND fragrance_id = $2 AND variant_id IS NOT DISTINCT FROM $3 AND is_primary`,
        [owner, row.fragrance_id, row.variant_id],
      );
      await c.query('UPDATE app.image_assets SET is_primary = true WHERE id = $1', [row.id]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  /** Validate, store and record one acquisition. Failures are recorded durably and returned typed. */
  async function ingest(
    owner: string,
    input: { fragranceId: string; variantId: string | null; kind: SourceKind; attribution: string; licenseNotes: string | null; makePrimary: boolean },
    acquire: () => Promise<{ bytes: Buffer; sourceRef: string | null }>,
    requestedRef: string | null,
  ) {
    let sourceRef = requestedRef;
    try {
      const got = await acquire();
      sourceRef = got.sourceRef ?? requestedRef;
      const img = await processImage(got.bytes);
      const dup = await db().query<Row>(
        `SELECT * FROM app.image_assets WHERE owner_id = $1 AND fragrance_id = $2 AND variant_id IS NOT DISTINCT FROM $3
            AND checksum = $4 AND status = 'available'`,
        [owner, input.fragranceId, input.variantId, img.checksum],
      );
      if (dup.rows[0]) {
        if (input.makePrimary) await setPrimary(owner, dup.rows[0]);
        return { row: await owned(owner, dup.rows[0].id), deduplicated: true };
      }
      const rel = await deps.store.put(img.checksum, img.original, img.display);
      const { rows } = await db().query<Row>(
        `INSERT INTO app.image_assets (owner_id, fragrance_id, variant_id, source_kind, source_ref, attribution_label, license_notes,
                                       storage_kind, storage_path, mime_type, width, height, byte_size, checksum, status, last_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'local_persistent', $8, $9, $10, $11, $12, $13, 'available', now()) RETURNING *`,
        [owner, input.fragranceId, input.variantId, input.kind, sourceRef, input.attribution, input.licenseNotes, rel, img.mime, img.width, img.height, img.original.length, img.checksum],
      );
      if (input.makePrimary) await setPrimary(owner, rows[0]!);
      return { row: await owned(owner, rows[0]!.id), deduplicated: false };
    } catch (e) {
      if (!(e instanceof ImageError)) throw e;
      // Durable diagnostic: uploads that are not images are "rejected"; remote problems are "failed".
      const status = input.kind === 'user_upload' ? 'rejected' : 'failed';
      const { rows } = await db().query<Row>(
        `INSERT INTO app.image_assets (owner_id, fragrance_id, variant_id, source_kind, source_ref, attribution_label, license_notes,
                                       storage_kind, status, failure_code, failure_detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [owner, input.fragranceId, input.variantId, input.kind, sourceRef?.slice(0, 2048) ?? null, input.attribution, input.licenseNotes,
         input.kind === 'user_upload' ? 'local_persistent' : 'remote_reference', status, e.code, e.message.slice(0, 500)],
      );
      throw new ApiError('VALIDATION_FAILED', e.message, { failureCode: e.code, image: publicImage(rows[0]!, null) });
    }
  }

  app.get(
    '/fragrances/:id/images',
    { schema: { params: Obj({ id: Uuid }), querystring: Obj({ variantId: Type.Optional(Uuid) }) } },
    async (req) => {
      const owner = req.session!.owner.id;
      await context(owner, req.params.id, req.query.variantId);
      const { rows } = await db().query<Row>(
        'SELECT * FROM app.image_assets WHERE owner_id = $1 AND fragrance_id = $2 ORDER BY created_at DESC, id',
        [owner, req.params.id],
      );
      const primary = await effective(owner, req.params.id, req.query.variantId ?? null);
      const s = deps.sources;
      const codes = (await db().query<{ gtin14: string }>('SELECT DISTINCT gtin14 FROM app.product_variants WHERE fragrance_id = $1 AND gtin14 IS NOT NULL ORDER BY gtin14 LIMIT 5', [req.params.id])).rows.map((r) => r.gtin14);
      return {
        images: rows.map((r) => publicImage(r, primary)),
        primaryId: primary,
        lookups: {
          barcode: { enabled: true, barcodes: codes, note: 'Open Beauty Facts (open product database; photos CC BY-SA, attribution kept).' },
          webSearch: { enabled: await deps.tinyfish.enabled(), note: 'TinyFish web search for this exact fragrance; you pick the image.' },
        },
        sources: {
          precedence: ['user_upload', 'approved_remote', 'scento', 'manual_external', 'web_search'],
          user_upload: { enabled: s.upload.enabled, note: s.upload.note, maxBytes: MAX_UPLOAD_BYTES },
          approved_remote: { enabled: s.approvedRemote.enabled, note: s.approvedRemote.note, hosts: s.approvedRemote.hosts },
          scento: { enabled: s.scento.enabled, note: s.scento.note },
          manual_external: { enabled: s.manualExternal.enabled, note: s.manualExternal.note, hosts: s.manualExternal.hosts },
          web_search: { enabled: await deps.tinyfish.enabled(), note: 'Images you pick from an owner-started web search (lowest precedence).' },
        },
      };
    },
  );

  app.post(
    '/fragrances/:id/images/upload',
    {
      bodyLimit: MAX_UPLOAD_BYTES,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        params: Obj({ id: Uuid }),
        querystring: Obj({ variantId: Type.Optional(Uuid), attribution: Type.Optional(Label), makePrimary: Type.Optional(Type.Boolean()) }),
      },
    },
    async (req, reply) => {
      const ct = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!UPLOAD_TYPES.includes(ct) || !Buffer.isBuffer(req.body)) throw new ApiError('VALIDATION_FAILED', 'Upload a JPEG, PNG or WebP image');
      const owner = req.session!.owner.id;
      await context(owner, req.params.id, req.query.variantId);
      const r = await ingest(
        owner,
        { fragranceId: req.params.id, variantId: req.query.variantId ?? null, kind: 'user_upload', attribution: req.query.attribution ?? 'Your photo', licenseNotes: null, makePrimary: req.query.makePrimary ?? false },
        () => deps.sources.upload.acquire({ bytes: req.body as Buffer }),
        null,
      );
      const primary = await effective(owner, req.params.id, req.query.variantId ?? null);
      return reply.code(r.deduplicated ? 200 : 201).send({ image: publicImage(r.row, primary), deduplicated: r.deduplicated });
    },
  );

  app.post(
    '/fragrances/:id/images/remote',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: Obj({ id: Uuid }),
        body: Obj({
          kind: Type.Union([Type.Literal('approved_remote'), Type.Literal('manual_external')]),
          url: Type.String({ minLength: 8, maxLength: 2048 }),
          attribution: Label,
          licenseNotes: Type.Optional(Type.String({ maxLength: 1000 })),
          variantId: Type.Optional(Uuid),
          makePrimary: Type.Optional(Type.Boolean()),
        }),
      },
    },
    async (req, reply) => {
      const owner = req.session!.owner.id;
      const b = req.body;
      await context(owner, req.params.id, b.variantId);
      const source = b.kind === 'approved_remote' ? deps.sources.approvedRemote : deps.sources.manualExternal;
      const r = await ingest(
        owner,
        { fragranceId: req.params.id, variantId: b.variantId ?? null, kind: b.kind, attribution: b.attribution, licenseNotes: b.licenseNotes ?? null, makePrimary: b.makePrimary ?? false },
        () => source.acquire({ url: b.url }),
        b.url,
      );
      const primary = await effective(owner, req.params.id, b.variantId ?? null);
      return reply.code(r.deduplicated ? 200 : 201).send({ image: publicImage(r.row, primary), deduplicated: r.deduplicated });
    },
  );

  async function fragranceFor(id: string) {
    const { rows } = await db().query<{ brand: string; name: string; concentration: string | null }>(
      'SELECT b.canonical_name AS brand, f.canonical_name AS name, f.concentration FROM app.fragrances f JOIN app.brands b ON b.id = f.brand_id WHERE f.id = $1',
      [id],
    );
    if (!rows[0]) throw new ApiError('NOT_FOUND', 'Fragrance not found');
    return rows[0];
  }

  // Barcode lookup in Open Beauty Facts: the given barcode, or this fragrance's known barcodes.
  app.post(
    '/fragrances/:id/images/barcode',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { params: Obj({ id: Uuid }), body: Obj({ barcode: Type.Optional(Type.String({ minLength: 8, maxLength: 20, pattern: '^[0-9 -]+$' })) }) } },
    async (req) => {
      const owner = req.session!.owner.id;
      const f = await fragranceFor(req.params.id);
      const codes = req.body.barcode
        ? [req.body.barcode]
        : (await db().query<{ gtin14: string }>('SELECT DISTINCT gtin14 FROM app.product_variants WHERE fragrance_id = $1 AND gtin14 IS NOT NULL ORDER BY gtin14 LIMIT 5', [req.params.id])).rows.map((r) => r.gtin14);
      if (!codes.length) return { results: [], message: 'No barcode is recorded for this fragrance yet. Enter the barcode from your bottle or box.' };
      const results = [];
      for (const code of codes) {
        const o = await lookupBarcode(code, deps.http);
        if (!o.found) {
          results.push({ ...o, candidate: null });
          continue;
        }
        // The barcode decides the product; the name check only flags a mismatch for the owner to see.
        const exactName = namesExactly(`${o.brands} ${o.productName}`, f.name) || namesExactly(o.productName, f.name);
        const c = o.imageUrl
          ? candidates.add({
              ownerId: owner,
              fragranceId: req.params.id,
              kind: 'approved_remote',
              imageUrl: o.imageUrl,
              pageUrl: o.productUrl,
              siteName: 'Open Beauty Facts',
              title: [o.brands, o.productName].filter(Boolean).join(' · ') || `Product ${o.barcode}`,
              attribution: 'Open Beauty Facts contributors (CC BY-SA)',
              licenseNotes: `Open Beauty Facts product ${o.barcode}: ${o.productUrl}. Photo licence CC BY-SA; attribution required.`,
              barcode: o.barcode,
              exactName,
            })
          : null;
        results.push({ ...o, candidate: c ? publicCandidate(c) : null });
      }
      return { results };
    },
  );

  // Web image search (TinyFish): owner-started, exact-name result pages only, owner picks one.
  app.post(
    '/fragrances/:id/images/search',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } }, schema: { params: Obj({ id: Uuid }) } },
    async (req) => {
      const owner = req.session!.owner.id;
      const f = await fragranceFor(req.params.id);
      try {
        const found = await searchImageCandidates(deps.tinyfish, f);
        const list = found.map((x) =>
          publicCandidate(
            candidates.add({
              ownerId: owner,
              fragranceId: req.params.id,
              kind: 'web_search',
              imageUrl: x.imageUrl,
              pageUrl: x.pageUrl,
              siteName: x.siteName,
              title: x.title,
              attribution: `${x.siteName} (found by web search)`.slice(0, 200),
              licenseNotes: `Found by an owner-started web search on ${x.pageUrl}. Personal-use copy for this private collection.`.slice(0, 1000),
              barcode: null,
              exactName: true,
            }),
          ),
        );
        return { available: true, candidates: list };
      } catch (e) {
        if (!(e instanceof TinyFishError)) throw e;
        return { available: false, code: e.code, message: e.message, candidates: [] };
      }
    },
  );

  // Downscaled preview of a candidate, fetched server-side with the SSRF guards; never stored.
  app.get(
    '/images/candidates/:cid/preview',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { params: Obj({ cid: Uuid }) } },
    async (req, reply) => {
      const c = candidates.get(req.params.cid, req.session!.owner.id);
      if (!c) throw new ApiError('NOT_FOUND', 'Candidate expired; search again');
      let buf = previews.get(c.id);
      if (!buf) {
        try {
          const got = await fromCandidate(c);
          buf = await sharp(got.bytes, { limitInputPixels: 50_000_000, failOn: 'error' }).rotate().resize({ width: 320, height: 400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
        } catch {
          throw new ApiError('NOT_FOUND', 'The image could not be loaded from its site');
        }
        if (previews.size > 200) previews.delete(previews.keys().next().value!);
        previews.set(c.id, buf);
      }
      return reply.header('content-type', 'image/webp').header('cache-control', 'private, max-age=1800').header('x-content-type-options', 'nosniff').send(buf);
    },
  );

  // Attach a reviewed candidate through the normal validated ingestion.
  app.post(
    '/fragrances/:id/images/candidates/:cid',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { params: Obj({ id: Uuid, cid: Uuid }), body: Obj({ makePrimary: Type.Optional(Type.Boolean()) }) } },
    async (req, reply) => {
      const owner = req.session!.owner.id;
      const c = candidates.get(req.params.cid, owner);
      if (!c || c.fragranceId !== req.params.id) throw new ApiError('NOT_FOUND', 'Candidate expired; search again');
      await context(owner, req.params.id, null);
      const r = await ingest(
        owner,
        { fragranceId: req.params.id, variantId: null, kind: c.kind, attribution: c.attribution, licenseNotes: c.licenseNotes, makePrimary: req.body.makePrimary ?? false },
        async () => {
          const got = await fromCandidate(c);
          return { bytes: got.bytes, sourceRef: got.finalUrl };
        },
        c.imageUrl,
      );
      const primary = await effective(owner, req.params.id, null);
      return reply.code(r.deduplicated ? 200 : 201).send({ image: publicImage(r.row, primary), deduplicated: r.deduplicated });
    },
  );

  // Re-validate a remote image. A failed check never discards the stored copy or the owner's primary
  // choice: it records the failure next to the still-available image.
  app.post(
    '/images/:id/refresh',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { params: Obj({ id: Uuid }) } },
    async (req) => {
      const owner = req.session!.owner.id;
      const row = await owned(owner, req.params.id);
      if (row.source_kind !== 'approved_remote' && row.source_kind !== 'manual_external') {
        throw new ApiError('VALIDATION_FAILED', 'Only remote images can be refreshed');
      }
      const source = row.source_kind === 'approved_remote' ? deps.sources.approvedRemote : deps.sources.manualExternal;
      try {
        const got = await source.acquire({ url: row.source_ref ?? '' });
        const img = await processImage(got.bytes);
        const rel = img.checksum === row.checksum && row.storage_path ? row.storage_path : await deps.store.put(img.checksum, img.original, img.display);
        await db().query(
          `UPDATE app.image_assets SET status = 'available', storage_kind = 'local_persistent', storage_path = $2, mime_type = $3, width = $4,
                  height = $5, byte_size = $6, checksum = $7, failure_code = NULL, failure_detail = NULL, last_verified_at = now() WHERE id = $1`,
          [row.id, rel, img.mime, img.width, img.height, img.original.length, img.checksum],
        );
      } catch (e) {
        if (!(e instanceof ImageError)) throw e;
        await db().query('UPDATE app.image_assets SET failure_code = $2, failure_detail = $3 WHERE id = $1', [row.id, e.code, e.message.slice(0, 500)]);
      }
      const fresh = await owned(owner, row.id);
      return { image: publicImage(fresh, await effective(owner, fresh.fragrance_id, fresh.variant_id)) };
    },
  );

  app.put('/images/:id/primary', { schema: { params: Obj({ id: Uuid }) } }, async (req) => {
    const owner = req.session!.owner.id;
    const row = await owned(owner, req.params.id);
    if (row.status !== 'available') throw new ApiError('CONFLICT', 'Only an available image can be primary');
    await setPrimary(owner, row);
    return { primaryId: await effective(owner, row.fragrance_id, row.variant_id) };
  });

  // Clears the explicit choice; the effective primary falls back to source precedence.
  app.delete('/images/:id/primary', { schema: { params: Obj({ id: Uuid }) } }, async (req) => {
    const owner = req.session!.owner.id;
    const row = await owned(owner, req.params.id);
    await db().query('UPDATE app.image_assets SET is_primary = false WHERE id = $1', [row.id]);
    return { primaryId: await effective(owner, row.fragrance_id, row.variant_id) };
  });

  app.delete('/images/:id', { schema: { params: Obj({ id: Uuid }) } }, async (req) => {
    const owner = req.session!.owner.id;
    const row = await owned(owner, req.params.id);
    await db().query('DELETE FROM app.image_assets WHERE id = $1', [row.id]);
    // Files are content-addressed and may be shared by another record; remove only when unreferenced.
    if (row.storage_path) {
      const still = await db().query('SELECT 1 FROM app.image_assets WHERE storage_path = $1 LIMIT 1', [row.storage_path]);
      if (!still.rowCount) await deps.store.remove(row.storage_path);
    }
    return { deleted: true, primaryId: await effective(owner, row.fragrance_id, row.variant_id) };
  });

  async function serve(reply: FastifyReply, row: Row, variant: 'display' | 'original') {
    if (row.status !== 'available' || !row.storage_path) throw new ApiError('NOT_FOUND', 'Image not available');
    const file = deps.store.resolve(row.storage_path, variant);
    const stream = createReadStream(file);
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', () => reject(new ApiError('NOT_FOUND', 'Image file is missing from the asset store')));
    });
    return reply
      .header('content-type', variant === 'display' ? 'image/webp' : row.mime_type!)
      .header('cache-control', 'private, max-age=86400')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', 'inline')
      .send(stream);
  }

  app.get('/images/:id/display', { schema: { params: Obj({ id: Uuid }) } }, async (req, reply) => serve(reply, await owned(req.session!.owner.id, req.params.id), 'display'));
  app.get('/images/:id/original', { schema: { params: Obj({ id: Uuid }) } }, async (req, reply) => serve(reply, await owned(req.session!.owner.id, req.params.id), 'original'));
}
