// Brand alias registry (spec/DATA_SOURCES.md §1). Open registry: unknown brands pass
// through normalised. Aliases only map *names of the same house*; sub-lines that are
// separate products (e.g. BOSS vs HUGO lines) stay part of the fragrance name.
import { normalizeIdentity } from './identity.js';

const FOCUS: Record<string, string[]> = {
  'Calvin Klein': ['ck', 'calvin klein'],
  Chanel: ['chanel'],
  Davidoff: ['davidoff', 'zino davidoff'],
  Dior: ['dior', 'christian dior', 'parfums christian dior'],
  'Hugo Boss': ['hugo boss', 'boss', 'hugo', 'boss hugo boss'],
  'Jean Paul Gaultier': ['jean paul gaultier', 'jpg', 'gaultier'],
  'JOOP!': ['joop!', 'joop'],
  Rabanne: ['rabanne', 'paco rabanne'],
  Versace: ['versace', 'gianni versace'],
};

const INDEX = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(FOCUS)) {
  for (const a of [canonical, ...aliases]) INDEX.set(normalizeIdentity(a)!, canonical);
}

/** Canonical brand key for comparison; unknown brands normalise to themselves. */
export function brandKey(name: string): string {
  const n = normalizeIdentity(name) ?? '';
  return normalizeIdentity(INDEX.get(n) ?? name) ?? '';
}

export function canonicalBrand(name: string): string {
  return INDEX.get(normalizeIdentity(name) ?? '') ?? name.trim();
}

export const FOCUS_BRANDS = Object.keys(FOCUS);

/** Every normalised way of writing this house (longest first); unknown brands give themselves. */
export function brandAliases(name: string): string[] {
  const key = brandKey(name);
  const out = new Set<string>([key, normalizeIdentity(name) ?? '']);
  for (const [alias, canonical] of INDEX) if (normalizeIdentity(canonical) === key) out.add(alias);
  return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}

/** Every known way of writing a focus house (normalised), longest first, for spotting a house at the start of a title. */
export const KNOWN_HOUSE_ALIASES: string[] = [...INDEX.keys()].sort((a, b) => b.length - a.length);
