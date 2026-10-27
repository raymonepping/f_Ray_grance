// Add a fragrance from a shop page (ADR-023). The owner pastes an allow-listed product URL; TinyFish
// fetches it (only the URL is sent); the parsed preview is stored in memory for 30 minutes. Nothing is
// saved until the owner confirms: then the identity is created (or a draft upgraded) as
// "owner_confirmed", and the page's notes become the owner's own claim citing the page. A
// Scento-verified identity is never changed.
import { randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError } from '../../errors.js';
import type { RotatingPool } from '../../db/pool.js';
import { parseShopPage, shopFor, type ShopPage } from '../../domain/shop-page.js';
import { addGapClaims, confirmOwnerIdentity } from '../../repo/enrichment.js';
import { TinyFishError, type TinyFishClient } from '../../providers/tinyfish.js';

const Obj = <T extends Parameters<typeof Type.Object>[0]>(p: T) => Type.Object(p, { additionalProperties: false });
const Uuid = Type.String({ format: 'uuid' });
const Name = Type.String({ minLength: 1, maxLength: 200 });
const TTL_MS = 30 * 60 * 1000;

interface Stored {
  id: string;
  ownerId: string;
  page: ShopPage;
  checkedAt: Date;
  expiresAt: number;
}

export async function shopRoutes(base: FastifyInstance, deps: { pool: RotatingPool; tinyfish: TinyFishClient }): Promise<void> {
  const app = base.withTypeProvider<TypeBoxTypeProvider>();
  const db = () => deps.pool.get();
  const previews = new Map<string, Stored>();
  const perOwner = (max: number, window: string) => ({
    rateLimit: { max, timeWindow: window, keyGenerator: (req: { session?: { owner: { id: string } } | null; ip: string }) => req.session?.owner.id ?? req.ip },
  });

  app.post('/fragrances/from-shop/preview', { config: perOwner(6, '10 minutes'), schema: { body: Obj({ url: Type.String({ minLength: 10, maxLength: 500 }) }) } }, async (req) => {
    const allowed = shopFor(req.body.url);
    if ('refused' in allowed) throw new ApiError('VALIDATION_FAILED', allowed.refused);
    if (!(await deps.tinyfish.enabled())) throw new ApiError('CONFLICT', 'Reading shop pages needs the TinyFish key in Vault (make tinyfish-key)');
    let fetched;
    try {
      fetched = await deps.tinyfish.fetchPage(allowed.url);
    } catch (e) {
      if (e instanceof TinyFishError) return { available: false, code: e.code, message: e.message };
      throw e;
    }
    const page = parseShopPage(allowed.url, { title: fetched.title, html: fetched.html });
    if ('refused' in page) throw new ApiError('VALIDATION_FAILED', page.refused);
    const now = Date.now();
    for (const [k, v] of previews) if (v.expiresAt < now) previews.delete(k);
    const stored: Stored = { id: randomUUID(), ownerId: req.session!.owner.id, page, checkedAt: new Date(), expiresAt: now + TTL_MS };
    previews.set(stored.id, stored);
    return { available: true, preview: { id: stored.id, ...page } };
  });

  app.post(
    '/fragrances/from-shop/:pid/confirm',
    { schema: { params: Obj({ pid: Uuid }), body: Obj({ brand: Type.Optional(Name), name: Type.Optional(Name), keepNotes: Type.Optional(Type.Boolean()) }) } },
    async (req, reply) => {
      const owner = req.session!.owner.id;
      const s = previews.get(req.params.pid);
      if (!s || s.ownerId !== owner || s.expiresAt < Date.now()) throw new ApiError('NOT_FOUND', 'Shop preview expired; read the page again');
      const brand = (req.body.brand ?? s.page.brand).trim();
      const name = (req.body.name ?? s.page.name).trim();
      const out = await confirmOwnerIdentity(db(), { brand, name, concentration: s.page.concentration });
      let notesSaved = false;
      const n = s.page.notes;
      if (out.status === 'owner_confirmed' && req.body.keepNotes !== false && (n.top || n.heart || n.base)) {
        await addGapClaims(
          db(),
          out.fragranceId,
          { url: s.page.url, siteName: s.page.shop, checkedAt: s.checkedAt, evidence: null, productNameOnPage: `${brand} ${name}` },
          [{ field: 'pyramid', value: n }],
          { provider: 'manual', origin: 'user', attribution: `Confirmed by you from ${s.page.shop}`, ownerId: owner },
        );
        notesSaved = true;
      }
      previews.delete(s.id);
      return reply.code(out.created ? 201 : 200).send({ fragranceId: out.fragranceId, created: out.created, identityStatus: out.status, notesSaved });
    },
  );
}
