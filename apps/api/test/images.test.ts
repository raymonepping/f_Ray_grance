// Perfume images (Phase 12): signature sniffing, SSRF guards, URL policy, source precedence,
// processing, and the owner-protected API (upload, remote attach, dedupe, primary, refresh,
// authorization, delete, serving). Disposable PG18; remote hosts are faked, never contacted.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createSession, CSRF_COOKIE, SESSION_COOKIE } from '../src/security/sessions.js';
import { createFragrance, upsertBrand } from '../src/repo/catalog.js';
import type { RotatingPool } from '../src/db/pool.js';
import { ImageError } from '../src/images/errors.js';
import { fetchImage, hostApproved, isPublicAddress, validateUrl } from '../src/images/net.js';
import { processImage } from '../src/images/process.js';
import { looksLikeMarkup, sniff } from '../src/images/signature.js';
import { buildSources, rankImages, SOURCE_PRECEDENCE, type Fetcher } from '../src/images/sources.js';
import { AssetStore } from '../src/images/store.js';
import { EXPECTED_SCHEMA_VERSION, runtimePool, seedOwner, sessionKey, testConfig, uniq } from './helpers.js';

const ORIGIN = 'http://localhost:8470';
const png = (w = 400, h = 500, r = 180) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 40, b: 60 } } }).png().toBuffer();
const jpeg = (w = 300, h = 400) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 20, g: 90, b: 160 } } }).jpeg().toBuffer();

describe('signature sniffing', () => {
  it('accepts JPEG, PNG and WebP by magic bytes only', async () => {
    expect(sniff(await png())).toBe('image/png');
    expect(sniff(await jpeg())).toBe('image/jpeg');
    expect(sniff(await sharp(await png()).webp().toBuffer())).toBe('image/webp');
    expect(sniff(Buffer.from('GIF89a......'))).toBeNull();
  });
  it('recognises HTML and SVG masquerading as images', () => {
    expect(looksLikeMarkup(Buffer.from('<!DOCTYPE html><html>'))).toBe(true);
    expect(looksLikeMarkup(Buffer.from('﻿  <svg xmlns="http://www.w3.org/2000/svg" onload="x()">'))).toBe(true);
    expect(sniff(Buffer.from('<svg/>'))).toBeNull();
  });
});

describe('SSRF guards and URL policy', () => {
  it('only treats globally routable addresses as public', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '64:ff9b::10.0.0.1', '224.0.0.1']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) expect(isPublicAddress(ip), ip).toBe(true);
    expect(isPublicAddress('not-an-ip')).toBe(false);
  });
  it('matches approved hosts exactly or by explicit wildcard subdomain', () => {
    expect(hostApproved('images.example.com', ['images.example.com'])).toBe(true);
    expect(hostApproved('evil-images.example.com', ['images.example.com'])).toBe(false);
    expect(hostApproved('cdn.example.com', ['*.example.com'])).toBe(true);
    expect(hostApproved('example.com', ['*.example.com'])).toBe(false);
    expect(hostApproved('example.com.evil.net', ['example.com'])).toBe(false);
  });
  it('refuses non-https, credentials, odd ports, IP literals and unapproved hosts', () => {
    const allowed = ['images.example.com'];
    const code = (u: string) => {
      try {
        validateUrl(u, allowed);
        return 'OK';
      } catch (e) {
        return (e as ImageError).code;
      }
    };
    expect(code('https://images.example.com/a.jpg')).toBe('OK');
    expect(code('http://images.example.com/a.jpg')).toBe('INSECURE_URL');
    expect(code('https://user:pw@images.example.com/a.jpg')).toBe('INSECURE_URL');
    expect(code('https://images.example.com:8443/a.jpg')).toBe('INSECURE_URL');
    expect(code('https://127.0.0.1/a.jpg')).toBe('IP_LITERAL');
    expect(code('https://[::1]/a.jpg')).toBe('IP_LITERAL');
    expect(code('https://other.example.org/a.jpg')).toBe('HOST_NOT_APPROVED');
    expect(code('file:///etc/passwd')).toBe('INSECURE_URL');
  });
  it('blocks a host that resolves to a private address before any socket opens', async () => {
    const lookup = ((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: '10.0.0.7', family: 4 }])) as never;
    await expect(fetchImage('https://images.example.com/a.jpg', { allowedHosts: ['images.example.com'], lookup, timeoutMs: 2000 })).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
    const mixed = ((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }])) as never;
    await expect(fetchImage('https://images.example.com/a.jpg', { allowedHosts: ['images.example.com'], lookup: mixed, timeoutMs: 2000 })).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
  });
});

describe('processing and precedence', () => {
  it('validates dimensions and builds a bounded, metadata-free WebP derivative', async () => {
    const big = await png(2400, 3000);
    const p = await processImage(big);
    expect([p.mime, p.width, p.height]).toEqual(['image/png', 2400, 3000]);
    const meta = await sharp(p.display).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(1200);
    expect(meta.exif).toBeUndefined();
    expect(p.checksum).toMatch(/^[0-9a-f]{64}$/);
    await expect(processImage(await png(40, 40))).rejects.toMatchObject({ code: 'DIMENSIONS' });
    await expect(processImage(Buffer.from('<html>nope</html>'))).rejects.toMatchObject({ code: 'NOT_AN_IMAGE' });
    await expect(processImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]))).rejects.toMatchObject({ code: 'DECODE_FAILED' });
  });
  it('ranks explicit primary first, then upload > approved remote > Scento > manual external, newest first', () => {
    expect(SOURCE_PRECEDENCE).toEqual(['user_upload', 'approved_remote', 'scento', 'manual_external']);
    const t = (s: string) => new Date(`2026-10-25T${s}:00Z`);
    const imgs = [
      { id: 'ext', source_kind: 'manual_external' as const, is_primary: false, status: 'available', created_at: t('12:00') },
      { id: 'remote', source_kind: 'approved_remote' as const, is_primary: false, status: 'available', created_at: t('11:00') },
      { id: 'upOld', source_kind: 'user_upload' as const, is_primary: false, status: 'available', created_at: t('09:00') },
      { id: 'upNew', source_kind: 'user_upload' as const, is_primary: false, status: 'available', created_at: t('10:00') },
      { id: 'failed', source_kind: 'user_upload' as const, is_primary: false, status: 'failed', created_at: t('13:00') },
    ];
    expect(rankImages(imgs).map((i) => i.id)).toEqual(['upNew', 'upOld', 'remote', 'ext']);
    expect(rankImages(imgs.map((i) => (i.id === 'ext' ? { ...i, is_primary: true } : i)))[0]!.id).toBe('ext');
  });
  it('reports the Scento slot as unsupported and remote sources as disabled without approved hosts', async () => {
    const s = buildSources({ providerHosts: [], externalHosts: [] });
    expect(s.scento.enabled).toBe(false);
    await expect(s.scento.acquire()).rejects.toMatchObject({ code: 'SOURCE_UNSUPPORTED' });
    await expect(s.approvedRemote.acquire({ url: 'https://x.example.com/a.jpg' })).rejects.toMatchObject({ code: 'SOURCE_DISABLED' });
  });
});

describe('images API', () => {
  let app: FastifyInstance;
  let rp: RotatingPool;
  let store: AssetStore;
  let A: Record<string, string>;
  let B: Record<string, string>;
  let frag: string;
  let other: string;
  const { key } = sessionKey();
  const remoteBodies = new Map<string, Buffer | ImageError>();
  const remoteCalls: string[] = [];
  // Fake transport behind the real allowlist check: nothing leaves the test process.
  const fetcher: Fetcher = async (url, opts) => {
    validateUrl(url, opts.allowedHosts);
    remoteCalls.push(url);
    const b = remoteBodies.get(url);
    if (!b) throw new ImageError('HTTP_ERROR', 'The image host answered HTTP 404');
    if (b instanceof ImageError) throw b;
    return { bytes: b, finalUrl: url };
  };
  const headersFor = async (owner: string) => {
    const s = await createSession(rp.get(), key, owner, 1);
    return { cookie: `${SESSION_COOKIE}=${s.token}; ${CSRF_COOKIE}=${s.csrfToken}`, origin: ORIGIN, 'x-csrf-token': s.csrfToken };
  };
  const upload = (h: Record<string, string>, f: string, body: Buffer, qs = '', type = 'image/png') =>
    app.inject({ method: 'POST', url: `/api/v1/fragrances/${f}/images/upload${qs}`, headers: { ...h, 'content-type': type }, payload: body });
  const call = (h: Record<string, string>, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    rp = await runtimePool();
    store = new AssetStore(mkdtempSync(path.join(tmpdir(), 'fray-images-')));
    const imageSources = buildSources({ providerHosts: ['images.provider.example'], externalHosts: ['*.museum.example'] }, fetcher);
    app = await buildApp({ config: testConfig(), pool: rp, key, imageSources, assetStore: store, expectedSchemaVersion: EXPECTED_SCHEMA_VERSION, logger: false });
    const ownerA = await seedOwner(rp.get());
    const ownerB = await seedOwner(rp.get());
    A = await headersFor(ownerA);
    B = await headersFor(ownerB);
    const brand = await upsertBrand(rp.get(), uniq('Rabanne'));
    frag = await createFragrance(rp.get(), { brandId: brand, name: uniq('Phantom'), concentration: 'parfum', identityStatus: 'verified' });
    other = await createFragrance(rp.get(), { brandId: brand, name: uniq('Invictus'), concentration: 'eau_de_parfum', identityStatus: 'verified' });
  });
  afterAll(async () => {
    await app.close();
    await rp.close();
  });

  it('lists an empty context with the source chain and Scento marked unsupported', async () => {
    const r = await call(A, 'GET', `/api/v1/fragrances/${frag}/images`);
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.images).toEqual([]);
    expect(b.primaryId).toBeNull();
    expect(b.sources.precedence).toEqual(['user_upload', 'approved_remote', 'scento', 'manual_external']);
    expect(b.sources.scento.enabled).toBe(false);
    expect(b.sources.approved_remote.hosts).toEqual(['images.provider.example']);
  });

  it('attaches an approved remote image, stores it outside the database and serves the derivative', async () => {
    remoteBodies.set('https://images.provider.example/phantom.jpg', await jpeg());
    const r = await call(A, 'POST', `/api/v1/fragrances/${frag}/images/remote`, { kind: 'approved_remote', url: 'https://images.provider.example/phantom.jpg', attribution: 'Provider X', licenseNotes: 'Operator-approved for personal use' });
    expect(r.statusCode).toBe(201);
    const img = r.json().image;
    expect(img).toMatchObject({ sourceKind: 'approved_remote', status: 'available', mimeType: 'image/jpeg', width: 300, height: 400, attribution: 'Provider X', effectivePrimary: true, isPrimary: false });
    const rel = (await rp.get().query('SELECT storage_path FROM app.image_assets WHERE id = $1', [img.id])).rows[0].storage_path;
    expect(existsSync(store.resolve(rel, 'original')) && existsSync(store.resolve(rel, 'display'))).toBe(true);
    const served = await app.inject({ method: 'GET', url: img.url, headers: A });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cache-control']).toBe('private, max-age=86400');
    expect((await sharp(served.rawPayload).metadata()).format).toBe('webp');
  });

  it('an owner upload takes precedence, stays primary when chosen, and new imports never replace it', async () => {
    const up = await upload(A, frag, await png(), '?attribution=My%20bottle&makePrimary=true');
    expect(up.statusCode).toBe(201);
    const mine = up.json().image;
    expect(mine).toMatchObject({ sourceKind: 'user_upload', isPrimary: true, effectivePrimary: true, attribution: 'My bottle' });
    remoteBodies.set('https://images.provider.example/phantom-2.jpg', await jpeg(320, 420));
    const later = await call(A, 'POST', `/api/v1/fragrances/${frag}/images/remote`, { kind: 'approved_remote', url: 'https://images.provider.example/phantom-2.jpg', attribution: 'Provider X' });
    expect(later.json().image.effectivePrimary).toBe(false);
    const list = (await call(A, 'GET', `/api/v1/fragrances/${frag}/images`)).json();
    expect(list.primaryId).toBe(mine.id);
    // The explicit choice also outranks precedence when the owner picks a remote image.
    const pick = await call(A, 'PUT', `/api/v1/images/${later.json().image.id}/primary`);
    expect(pick.json().primaryId).toBe(later.json().image.id);
    expect((await rp.get().query('SELECT count(*)::int AS n FROM app.image_assets WHERE fragrance_id = $1 AND is_primary', [frag])).rows[0].n).toBe(1);
    const clear = await call(A, 'DELETE', `/api/v1/images/${later.json().image.id}/primary`);
    expect(clear.json().primaryId).toBe(mine.id); // back to precedence: the upload
    // Read adapters expose the effective primary.
    const profile = (await call(A, 'GET', `/api/v1/fragrances/${frag}/profile`)).json();
    expect(profile.primaryImageId).toBe(mine.id);
  });

  it('deduplicates identical bytes by checksum within a context', async () => {
    const bytes = await png(400, 500, 99);
    const first = await upload(A, frag, bytes);
    const again = await upload(A, frag, bytes);
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ deduplicated: true, image: { id: first.json().image.id } });
  });

  it('records durable failures: missing remote image, disallowed origin, HTML upload', async () => {
    const missing = await call(A, 'POST', `/api/v1/fragrances/${frag}/images/remote`, { kind: 'approved_remote', url: 'https://images.provider.example/gone.jpg', attribution: 'Provider X' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.details).toMatchObject({ failureCode: 'HTTP_ERROR', image: { status: 'failed', url: null } });
    const before = remoteCalls.length;
    const evil = await call(A, 'POST', `/api/v1/fragrances/${frag}/images/remote`, { kind: 'manual_external', url: 'https://169.254.169.254/latest/meta-data', attribution: 'x' });
    expect(evil.json().error.details.failureCode).toBe('IP_LITERAL');
    const off = await call(A, 'POST', `/api/v1/fragrances/${frag}/images/remote`, { kind: 'manual_external', url: 'https://random.example.net/a.jpg', attribution: 'x' });
    expect(off.json().error.details.failureCode).toBe('HOST_NOT_APPROVED');
    expect(remoteCalls.length).toBe(before); // nothing was contacted
    const html = await upload(A, frag, Buffer.from('<!doctype html><html><body>not an image</body></html>'));
    expect(html.statusCode).toBe(400);
    expect(html.json().error.details).toMatchObject({ failureCode: 'NOT_AN_IMAGE', image: { status: 'rejected' } });
    const wrongType = await app.inject({ method: 'POST', url: `/api/v1/fragrances/${frag}/images/upload`, headers: { ...A, 'content-type': 'image/svg+xml' }, payload: '<svg/>' });
    expect(wrongType.statusCode).toBe(415);
    const statuses = (await call(A, 'GET', `/api/v1/fragrances/${frag}/images`)).json().images.map((i: { status: string }) => i.status);
    expect(statuses.filter((s: string) => s === 'failed').length).toBeGreaterThanOrEqual(3);
    expect(statuses).toContain('rejected');
  });

  it('refresh keeps the stored copy and the primary when the remote has gone away', async () => {
    const list = (await call(A, 'GET', `/api/v1/fragrances/${frag}/images`)).json();
    const remote = list.images.find((i: { sourceRef: string | null }) => i.sourceRef === 'https://images.provider.example/phantom.jpg');
    remoteBodies.delete('https://images.provider.example/phantom.jpg');
    const r = (await call(A, 'POST', `/api/v1/images/${remote.id}/refresh`)).json().image;
    expect(r).toMatchObject({ status: 'available', failureCode: 'HTTP_ERROR' });
    expect((await call(A, 'GET', `/api/v1/fragrances/${frag}/images`)).json().primaryId).toBe(list.primaryId);
    const upload = list.images.find((i: { sourceKind: string }) => i.sourceKind === 'user_upload');
    expect((await call(A, 'POST', `/api/v1/images/${upload.id}/refresh`)).statusCode).toBe(400);
  });

  it("enforces ownership: another owner's image behaves as missing; CSRF and auth are required", async () => {
    const id = (await call(A, 'GET', `/api/v1/fragrances/${frag}/images`)).json().primaryId;
    expect((await app.inject({ method: 'GET', url: `/api/v1/images/${id}/display`, headers: B })).statusCode).toBe(404);
    expect((await call(B, 'PUT', `/api/v1/images/${id}/primary`)).statusCode).toBe(404);
    expect((await call(B, 'DELETE', `/api/v1/images/${id}`)).statusCode).toBe(404);
    expect((await call(B, 'GET', `/api/v1/fragrances/${frag}/images`)).json().images).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/api/v1/images/${id}/display` })).statusCode).toBe(401);
    const noCsrf = { cookie: A.cookie!, origin: ORIGIN };
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/images/${id}`, headers: noCsrf })).statusCode).toBe(403);
    expect((await upload(A, '00000000-0000-4000-8000-000000000000', await png())).statusCode).toBe(404);
  });

  it('deletes metadata and removes the file only when no record still references it', async () => {
    const bytes = await png(500, 600, 12);
    const a = (await upload(A, frag, bytes)).json().image;
    const b = (await upload(A, other, bytes)).json().image; // same bytes, other context
    const rel = (await rp.get().query('SELECT storage_path FROM app.image_assets WHERE id = $1', [a.id])).rows[0].storage_path;
    expect((await call(A, 'DELETE', `/api/v1/images/${a.id}`)).json().deleted).toBe(true);
    expect(existsSync(store.resolve(rel, 'original'))).toBe(true); // still used by b
    await call(A, 'DELETE', `/api/v1/images/${b.id}`);
    expect(existsSync(store.resolve(rel, 'original'))).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/api/v1/images/${a.id}/display`, headers: A })).statusCode).toBe(404);
  });
});
