// API models consumed by the UI (validated server-side; the client never invents values).
export type CollectionState = 'owned' | 'previously_owned' | 'sampled' | 'wishlist' | 'rejected';
export type Origin = 'user' | 'official' | 'provider' | 'derived';

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
  identity_status: 'verified' | 'draft' | 'needs_review';
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

export const ORIGIN_LABEL: Record<Origin, string> = { user: 'Personal', official: 'Official', provider: 'Scento', derived: 'Derived' };
