// API models consumed by the UI (validated server-side; the client never invents values).
export type CollectionState = 'owned' | 'previously_owned' | 'sampled' | 'wishlist' | 'rejected';
export type Origin = 'user' | 'official' | 'provider' | 'derived' | 'research';

export interface Pyramid {
  top: string[] | null;
  heart: string[] | null;
  base: string[] | null;
}

export interface EffectiveField<T = unknown> {
  value: T;
  origin: Origin;
  claimedAt: string;
  source: { provider: string; url: string | null; attribution: string | null; checkedAt: string } | null;
}

export interface Fragrance {
  id: string;
  brand: string;
  canonical_name: string;
  flanker: string | null;
  concentration: string | null;
  launch_year: number | null;
  identity_status: 'verified' | 'draft' | 'needs_review' | 'owner_confirmed';
}

export const STATE_LABEL: Record<CollectionState, string> = {
  owned: 'Owned',
  previously_owned: 'Previously owned',
  sampled: 'Sample',
  wishlist: 'Wishlist',
  rejected: 'Rejected',
};

export const CONCENTRATION_LABEL: Record<string, string> = {
  parfum: 'Parfum',
  extrait: 'Extrait de parfum',
  elixir: 'Elixir',
  eau_de_parfum: 'Eau de parfum',
  eau_de_toilette: 'Eau de toilette',
  eau_de_cologne: 'Eau de cologne',
  eau_fraiche: 'Eau fraîche',
  body_mist: 'Body mist',
  other: 'Other',
};

export const ORIGIN_LABEL: Record<Origin, string> = { user: 'Personal', official: 'Official', provider: 'Scento', derived: 'Derived', research: 'Web research' };
/** Provider claims are labelled by their actual source (ADR-021: Scento, NoteboxD, ScentRev). */
export const PROVIDER_LABEL: Record<string, string> = { scento: 'Scento', noteboxd: 'NoteboxD', scentrev: 'ScentRev', fragella: 'Fragella' };
export const sourceLabel = (f: { origin: Origin; source?: { provider?: string | null } | null }): string =>
  f.origin === 'provider' ? (PROVIDER_LABEL[f.source?.provider ?? 'scento'] ?? 'Provider') : ORIGIN_LABEL[f.origin];

export interface HistoryEvent {
  id: string;
  from_state: CollectionState | null;
  to_state: CollectionState;
  occurred_at: string;
  user_reason: string | null;
}

export interface CollectionEntry {
  id: string;
  fragrance_id: string;
  variant_id: string | null;
  state: CollectionState;
  rating: number | null;
  personal_note: string | null;
  acquired_on: string | null;
  created_at: string;
  updated_at: string;
  history?: HistoryEvent[];
}

export interface Variant {
  id: string;
  gtin14: string | null;
  bottle_ml: string | null;
  packaging_type: string | null;
  verification_state: 'verified' | 'unverified' | 'rejected';
}

export const STATES: CollectionState[] = ['owned', 'previously_owned', 'sampled', 'wishlist', 'rejected'];

// Perfume images (Phase 12).
export type ImageSourceKind = 'user_upload' | 'approved_remote' | 'scento' | 'manual_external' | 'web_search';
export interface ImageAsset {
  id: string;
  fragranceId: string;
  variantId: string | null;
  sourceKind: ImageSourceKind;
  sourceRef: string | null;
  attribution: string;
  licenseNotes: string | null;
  storageKind: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  checksum: string | null;
  status: 'pending' | 'available' | 'failed' | 'rejected';
  failureCode: string | null;
  failureDetail: string | null;
  isPrimary: boolean;
  effectivePrimary: boolean;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  url: string | null;
}
export interface ImageSourceInfo { enabled: boolean; note: string; hosts?: string[]; maxBytes?: number }
export interface ImageCandidate {
  id: string;
  fragranceId: string;
  kind: 'approved_remote' | 'web_search';
  pageUrl: string;
  siteName: string;
  title: string;
  attribution: string;
  licenseNotes: string;
  barcode: string | null;
  exactName: boolean;
  previewUrl: string;
}
export interface ImagesResponse {
  images: ImageAsset[];
  primaryId: string | null;
  lookups: { barcode: { enabled: boolean; barcodes: string[]; note: string }; webSearch: { enabled: boolean; note: string } };
  sources: { precedence: ImageSourceKind[] } & Record<ImageSourceKind, ImageSourceInfo>;
}
export const IMAGE_SOURCE_LABEL: Record<ImageSourceKind, string> = {
  user_upload: 'Your upload',
  approved_remote: 'Approved provider',
  scento: 'Scento',
  manual_external: 'External URL',
  web_search: 'Web search',
};

/** Verified by an exact Scento match, or confirmed by the owner from shop evidence (ADR-023). */
export const isConfirmedIdentity = (status: string | null | undefined): boolean => status === 'verified' || status === 'owner_confirmed';
