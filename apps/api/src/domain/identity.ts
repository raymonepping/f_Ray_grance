// Mirrors app.normalize_identity() in db/migrations/0001. Conservative: folds case,
// accents and punctuation but never removes words, so near-names stay distinct
// ("Invictus Elixir" !== "Invictus Victory Elixir").
export function normalizeIdentity(input: string): string | null {
  const folded = input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[’']/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9!]+/g, ' ')
    .trim();
  return folded === '' ? null : folded;
}

export const COLLECTION_STATES = ['owned', 'previously_owned', 'sampled', 'wishlist', 'rejected'] as const;
export type CollectionState = (typeof COLLECTION_STATES)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const TRAITS_CORE = ['sweet', 'fresh', 'spicy', 'woody', 'warm'] as const;
export const TRAITS_EXTENDED = ['aromatic', 'fruity', 'gourmand', 'smoky', 'green', 'marine_mineral'] as const;
