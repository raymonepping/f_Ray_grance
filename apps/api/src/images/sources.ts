// Image source chain (Phase 12). Each adapter turns an owner request into validated bytes plus
// provenance; precedence decides which available image is shown when the owner has not chosen one.
//   1 user_upload      owner-provided bytes
//   2 approved_remote  operator-approved provider hosts (FRAY_IMAGE_PROVIDER_HOSTS)
//   3 scento           only if Scento documents an image source; v1.0.0 does not, so it is unsupported
//   4 manual_external  owner-entered URL on an operator-approved host (FRAY_IMAGE_EXTERNAL_HOSTS)
//   5 web_search       an image the owner picked from an owner-started web search (ADR-013)
// Open Beauty Facts barcode lookups are approved_remote (approved by ADR-013, fixed host).
// There is no crawler or catalogue mirroring: every fetch is one URL the owner chose or confirmed.
import { ImageError } from './errors.js';
import { fetchImage, type FetchOptions } from './net.js';

export type SourceKind = 'user_upload' | 'approved_remote' | 'scento' | 'manual_external' | 'web_search';
export const SOURCE_PRECEDENCE: readonly SourceKind[] = ['user_upload', 'approved_remote', 'scento', 'manual_external', 'web_search'];

export interface Acquired {
  bytes: Buffer;
  sourceRef: string | null;
}

export interface ImageSourceAdapter {
  readonly kind: SourceKind;
  readonly enabled: boolean;
  /** Human-readable reason when disabled or unsupported (shown to the owner). */
  readonly note: string;
  acquire(input: { bytes?: Buffer; url?: string }): Promise<Acquired>;
}

export class UploadSource implements ImageSourceAdapter {
  readonly kind = 'user_upload' as const;
  readonly enabled = true;
  readonly note = 'Owner upload (JPEG, PNG or WebP).';
  async acquire(input: { bytes?: Buffer }): Promise<Acquired> {
    if (!input.bytes?.length) throw new ImageError('NOT_AN_IMAGE', 'No image bytes were uploaded');
    return { bytes: input.bytes, sourceRef: null };
  }
}

export type Fetcher = (url: string, opts: FetchOptions) => Promise<{ bytes: Buffer; finalUrl: string }>;

export class RemoteSource implements ImageSourceAdapter {
  constructor(
    readonly kind: 'approved_remote' | 'manual_external',
    readonly hosts: readonly string[],
    private readonly fetcher: Fetcher = fetchImage,
    private readonly limits: Pick<FetchOptions, 'maxBytes' | 'timeoutMs' | 'lookup'> = {},
  ) {}
  get enabled() {
    return this.hosts.length > 0;
  }
  get note() {
    return this.enabled ? `Approved hosts: ${this.hosts.join(', ')}` : 'No approved hosts are configured for this source.';
  }
  async acquire(input: { url?: string }): Promise<Acquired> {
    if (!this.enabled) throw new ImageError('SOURCE_DISABLED', this.note);
    if (!input.url) throw new ImageError('INSECURE_URL', 'An image URL is required');
    const r = await this.fetcher(input.url, { allowedHosts: this.hosts, ...this.limits });
    return { bytes: r.bytes, sourceRef: r.finalUrl };
  }
}

/** Scento slot: kept in the chain so the decision is explicit and reported, never improvised. */
export class ScentoImageSource implements ImageSourceAdapter {
  readonly kind = 'scento' as const;
  readonly enabled = false;
  readonly note = 'The Scento Perfume API (v1.0.0, checked 2026-10-25) documents no image field; page scraping is not used.';
  async acquire(): Promise<Acquired> {
    throw new ImageError('SOURCE_UNSUPPORTED', this.note);
  }
}

export interface ImageSources {
  upload: UploadSource;
  approvedRemote: RemoteSource;
  scento: ScentoImageSource;
  manualExternal: RemoteSource;
}

export function buildSources(cfg: { providerHosts: string[]; externalHosts: string[] }, fetcher?: Fetcher, limits?: Pick<FetchOptions, 'maxBytes' | 'timeoutMs' | 'lookup'>): ImageSources {
  return {
    upload: new UploadSource(),
    approvedRemote: new RemoteSource('approved_remote', cfg.providerHosts, fetcher, limits),
    scento: new ScentoImageSource(),
    manualExternal: new RemoteSource('manual_external', cfg.externalHosts, fetcher, limits),
  };
}

/** Ranks candidates exactly like app.primary_image(): explicit primary, precedence, then newest. */
export function rankImages<T extends { source_kind: SourceKind; is_primary: boolean; status: string; created_at: Date | string }>(images: T[]): T[] {
  return images
    .filter((i) => i.status === 'available')
    .sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) ||
        SOURCE_PRECEDENCE.indexOf(a.source_kind) - SOURCE_PRECEDENCE.indexOf(b.source_kind) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}
