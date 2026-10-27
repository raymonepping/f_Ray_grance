// Turns a barcode database's product title into a search hint (brand, name, size, concentration).
// It is a hint only: identity is still decided by the exact Scento resolver or by the owner
// (manual draft). Nothing here guesses: it removes size and shop clutter, and keeps concentration words
// in the name (they can be part of it, as in "Sauvage Parfum") while also offering a core name for matching.
import { mapConcentration, type Concentration } from './concentration.js';
import { canonicalBrand, KNOWN_HOUSE_ALIASES } from './brands.js';
import { normalizeIdentity } from './identity.js';

export interface BarcodeHint {
  brand: string | null;
  /** Cleaned name, keeping concentration words that may be part of the identity ("Sauvage Parfum"). */
  name: string;
  /** The name without trailing concentration words ("Sauvage"); used only for matching. */
  core: string;
  sizeMl: number | null;
  concentration: Concentration | null;
  query: string;
}

const LINE_ALIASES = new Set(['boss', 'hugo', 'ck']);

const CONC_WORDS = /\b(eau\s+de\s+parfum|eau\s+de\s+toilette|eau\s+de\s+cologne|extrait(?:\s+de\s+parfum)?|parfum|perfume|cologne|edp|edt|edc|elixir)\b/gi;

export function hintFromProductTitle(title: string, brands: string, knownHouses: string[] = []): BarcodeHint {
  let t = title.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const size = t.match(/(\d+(?:[.,]\d+)?)\s*(ml|millilit(?:er|re)s?)\b/i);
  const sizeMl = size ? Number(size[1]!.replace(',', '.')) : null;
  // Concentration wording anywhere in the title, before it is stripped from the name.
  const concs = [...new Set((t.match(CONC_WORDS) ?? []).map((w) => mapConcentration(w)).filter((c): c is Concentration => !!c))];
  // Brand: the database's own field, else a known house the title starts with.
  const brandField = brands.split(',')[0]?.trim() || null;
  const lower = normalizeIdentity(t) ?? '';
  // Known houses from the source's suggestions first, then the app's own brand aliases, longest
  // first ("Paco Rabanne" before "Rabanne"); a matched alias is shown as its canonical house.
  const starts = (h: string) => { const n = normalizeIdentity(h); return !!n && lower.startsWith(`${n} `); };
  const fromSource = knownHouses.filter(starts).sort((a, b) => b.length - a.length)[0];
  const alias = fromSource ? null : KNOWN_HOUSE_ALIASES.find(starts);
  const matched = brandField ?? fromSource ?? alias ?? null;
  const house = brandField ?? fromSource ?? (alias ? canonicalBrand(alias) : null);
  // Line names that are also house aliases stay in the fragrance name (brands.ts: "BOSS Bottled",
  // "CK One", "HUGO Man" are product names); only the house is recognised.
  if (matched && !(alias && LINE_ALIASES.has(alias))) {
    const n = normalizeIdentity(matched)!;
    const words = n.split(' ').length;
    if (lower.startsWith(`${n} `)) t = t.split(/\s+/).slice(words).join(' ');
  }
  t = t.split(/\s+[-–|]\s+/)[0]!; // "Name Parfum - Eau de Parfum 100ml" -> "Name Parfum"
  t = t.replace(/\d+(?:[.,]\d+)?\s*(ml|millilit(?:er|re)s?|fl\.?\s*oz|oz)\b/gi, ' ');
  // Shop clutter: gender labels, "fragrance(s)", "spray", "tester", ellipses. "Pour Homme" stays (it is part of names).
  t = t
    .replace(/(\.\.\.|…)/g, ' ')
    .replace(/\b(men'?s|women'?s|ladies|unisex|for\s+(?:men|women|him|her))\b/gi, ' ')
    .replace(/\b(fragrances?|spray|vaporisateur|tester|gift\s*set|new|authentic)\b/gi, ' ');
  const name = t.replace(/\s+/g, ' ').trim();
  let core = name;
  for (let i = 0; i < 4; i++) core = core.replace(/\s+(eau\s+de\s+parfum|eau\s+de\s+toilette|eau\s+de\s+cologne|parfum\s+intense|extrait|parfum|perfume|edp|edt|edc)\s*$/i, '');
  return { brand: house, name, core: core.trim() || name, sizeMl: sizeMl && sizeMl > 0 && sizeMl < 5000 ? sizeMl : null, concentration: concs.length === 1 ? concs[0]! : null, query: [house, name].filter(Boolean).join(' ') };
}
