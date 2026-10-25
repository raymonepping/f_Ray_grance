// Server-side remote image fetch with SSRF protection. Only https URLs on an explicitly approved host
// are fetched; every DNS answer is checked against private, loopback, link-local and reserved ranges
// before a socket opens (the check runs inside the connection's own lookup, so a rebinding answer
// cannot slip in afterwards). Redirects are followed manually and re-validated, sizes and time are
// bounded, and the declared type must be a raster image.
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import type { IncomingMessage } from 'node:http';
import { ImageError } from './errors.js';

const blocked = new net.BlockList();
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(a, p, 'ipv4');
for (const [a, p] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64], ['2001::', 23],
] as const) blocked.addSubnet(a, p, 'ipv6');

/** True only for globally routable unicast addresses. IPv4-mapped/NAT64 IPv6 is judged by its IPv4. */
export function isPublicAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return !blocked.check(ip, 'ipv4');
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]!);
    return !blocked.check(lower, 'ipv6');
  }
  return false;
}

/** Exact host match, or `*.example.com` for subdomains of an approved domain (not the apex). */
export function hostApproved(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return allowed.some((a) => {
    const e = a.toLowerCase();
    return e.startsWith('*.') ? h.endsWith(e.slice(1)) && h.length > e.length - 1 : h === e;
  });
}

export function validateUrl(raw: string, allowed: readonly string[]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ImageError('INSECURE_URL', 'Not a valid URL');
  }
  if (u.protocol !== 'https:') throw new ImageError('INSECURE_URL', 'Only https image URLs are accepted');
  if (u.username || u.password) throw new ImageError('INSECURE_URL', 'URLs with credentials are refused');
  if (u.port && u.port !== '443') throw new ImageError('INSECURE_URL', 'Only the default https port is accepted');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) throw new ImageError('IP_LITERAL', 'Use the approved host name, not an IP address');
  if (!hostApproved(host, allowed)) throw new ImageError('HOST_NOT_APPROVED', `${host} is not an approved image host`);
  return u;
}

type LookupFn = (hostname: string, options: dns.LookupAllOptions, cb: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

function guardedLookup(resolve: LookupFn) {
  return (hostname: string, options: dns.LookupOptions | number, cb: (...args: unknown[]) => void) => {
    const opts = typeof options === 'number' ? { family: options } : options;
    resolve(hostname, { ...opts, all: true } as dns.LookupAllOptions, (err, addresses) => {
      if (err) return cb(err);
      if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
        return cb(Object.assign(new Error('resolves to a non-public address'), { code: 'FRAY_PRIVATE_ADDRESS' }));
      }
      if ((opts as dns.LookupOptions).all) return cb(null, addresses);
      return cb(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

export interface FetchOptions {
  allowedHosts: readonly string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** DNS resolver (injectable for tests); every answer still passes the public-address guard. */
  lookup?: LookupFn;
}

export interface Fetched {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
}

export async function fetchImage(raw: string, opts: FetchOptions): Promise<Fetched> {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  const lookup = guardedLookup(opts.lookup ?? (dns.lookup as unknown as LookupFn));
  let url = validateUrl(raw, opts.allowedHosts);
  for (let hop = 0; ; hop++) {
    const res = await get(url, lookup, Math.max(1, deadline - Date.now()));
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (hop >= (opts.maxRedirects ?? 3)) throw new ImageError('TOO_MANY_REDIRECTS', 'Too many redirects');
      try {
        url = validateUrl(new URL(res.headers.location, url).toString(), opts.allowedHosts);
      } catch (e) {
        if (e instanceof ImageError && e.code !== 'INSECURE_URL') throw new ImageError('REDIRECT_NOT_APPROVED', `Redirect refused: ${e.message}`);
        throw e;
      }
      continue;
    }
    if (status !== 200) {
      res.resume();
      throw new ImageError('HTTP_ERROR', `The image host answered HTTP ${status}`);
    }
    const contentType = String(res.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
      res.resume();
      throw new ImageError(contentType.startsWith('image/') ? 'UNSUPPORTED_FORMAT' : 'NOT_AN_IMAGE', `Declared type "${contentType || 'none'}" is not a JPEG, PNG or WebP image`);
    }
    const declared = Number(res.headers['content-length'] ?? 0);
    if (declared > maxBytes) {
      res.destroy();
      throw new ImageError('TOO_LARGE', 'The image is larger than the size limit');
    }
    const bytes = await readBounded(res, maxBytes, deadline);
    return { bytes, contentType, finalUrl: url.toString() };
  }
}

function get(url: URL, lookup: ReturnType<typeof guardedLookup>, ms: number): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      lookup: lookup as never,
      agent: false,
      headers: { accept: 'image/webp,image/png,image/jpeg', 'user-agent': 'F-Ray-grance/0.1 (personal collection; single image fetch)' },
    });
    const timer = setTimeout(() => req.destroy(new ImageError('TIMEOUT', 'The image host did not answer in time')), ms);
    req.on('response', (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    req.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err instanceof ImageError) reject(err);
      else if (err.code === 'FRAY_PRIVATE_ADDRESS') reject(new ImageError('PRIVATE_ADDRESS', 'The host resolves to a private or reserved address'));
      else reject(new ImageError('NETWORK', 'The image host could not be reached'));
    });
  });
}

function readBounded(res: IncomingMessage, maxBytes: number, deadline: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => res.destroy(new ImageError('TIMEOUT', 'The image download took too long')), Math.max(1, deadline - Date.now()));
    res.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) res.destroy(new ImageError('TOO_LARGE', 'The image is larger than the size limit'));
      else chunks.push(c);
    });
    res.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    res.on('error', (e) => {
      clearTimeout(timer);
      reject(e instanceof ImageError ? e : new ImageError('NETWORK', 'The image download failed'));
    });
  });
}
