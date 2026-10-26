// Exact identity for text found on the web (ADR-016, R4): a page title or product name names
// exactly one fragrance only when, after removing that fragrance's own name, its house, concentration
// wording that does not contradict the known one, sizes and packaging words, nothing is left.
// Any leftover word ("Very Cool", "Victory", "Intense", another house) marks a different product.
// Uses the same normalisation (identity.ts), brand aliases (brands.ts) and concentration vocabulary
// (concentration.ts) as the Scento resolver; it never loosens them.
import { brandAliases } from './brands.js';
import { mapConcentration, type Concentration } from './concentration.js';
import { normalizeIdentity } from './identity.js';

export interface TrustedIdentity {
  brand: string;
  name: string;
  concentration: Concentration | null;
}

export interface IdentityCheck {
  exact: boolean;
  /** Why it is not exact, for the owner; null when exact. */
  reason: string | null;
  /** Words left over after removing everything that belongs to the trusted identity. */
  residue: string[];
}

// Normalised concentration wording, longest first so "eau de parfum" wins over "parfum".
const CONC_WORDS = ['extrait de parfum', 'eau de parfum', 'eau de toilette', 'eau de cologne', 'eau fraiche', 'body mist', 'extrait', 'parfum', 'perfume', 'cologne', 'elixir', 'edp', 'edt', 'edc'];
// Words that describe the pack or the listing, never the juice. Deliberately short: anything not
// here (edition, intense, limited, set, absolu...) counts as a different product.
const PACKAGING = new Set(['spray', 'vaporisateur', 'vaporizer', 'natural', 'for', 'men', 'man', 'women', 'woman', 'him', 'her', 'pour', 'homme', 'femme', 'unisex', 's', 'by', 'the', 'and', 'fragrance', 'tester', 'refill', 'refillable', 'bottle', 'buy', 'shop', 'online', 'new', 'notes', 'ml', 'oz', 'fl']);
const SIZE = /\b\d+(?: \d+)? ?(?:ml|oz|fl oz|fl)\b/g;
const YEAR = /\b(?:19|20)\d{2}\b/g;

const pad = (s: string) => ` ${s} `;
const cut = (hay: string, phrase: string) => {
  let out = hay;
  while (out.includes(pad(phrase))) out = out.split(pad(phrase)).join(' ');
  return out;
};

/** One segment of a title ("Sauvage Dior cologne - a fragrance for men 2015" → "Sauvage Dior cologne"). */
function segments(text: string): string[] {
  return text.split(/\s[|–—:-]\s|\s·\s|\s\/\s/).map((s) => s.trim()).filter(Boolean);
}

function checkSegment(segment: string, id: TrustedIdentity): IdentityCheck {
  const n = normalizeIdentity(id.name);
  let t = pad(normalizeIdentity(segment) ?? '');
  if (!n || !t.includes(pad(n))) return { exact: false, reason: `does not name "${id.name}"`, residue: [] };
  t = cut(t, n);
  for (const a of brandAliases(id.brand)) t = cut(t, a);
  for (const w of CONC_WORDS) {
    if (!t.includes(pad(w))) continue;
    const c = mapConcentration(w);
    // "elixir" is also a flanker word: strip it only when it is the known concentration.
    if (w === 'elixir' && id.concentration !== 'elixir') continue;
    if (id.concentration && c && c !== id.concentration) {
      return { exact: false, reason: `states ${w}, a different concentration`, residue: [w] };
    }
    t = cut(t, w);
  }
  t = pad(t.replace(SIZE, ' ').replace(YEAR, ' '));
  const residue = t.split(' ').filter((w) => w && !PACKAGING.has(w) && !/^\d+$/.test(w));
  return residue.length
    ? { exact: false, reason: `also names "${residue.join(' ')}", so it may be a different product`, residue }
    : { exact: true, reason: null, residue: [] };
}

/** True only when some segment of the text names exactly this fragrance and nothing else. */
export function checkExactIdentity(text: string, id: TrustedIdentity): IdentityCheck {
  let first: IdentityCheck | null = null;
  for (const s of segments(text)) {
    const r = checkSegment(s, id);
    if (r.exact) return r;
    // Prefer explaining the segment that did name the fragrance.
    if (!first || (!first.residue.length && r.residue.length)) first = r;
  }
  return first ?? { exact: false, reason: `does not name "${id.name}"`, residue: [] };
}
