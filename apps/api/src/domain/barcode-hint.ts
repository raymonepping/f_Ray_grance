// Turns a barcode database's product title into a search hint (brand, name, size, concentration).
// It is a hint only: identity is still decided by the exact Scento resolver or by the owner
// (manual draft). Nothing here guesses beyond removing size, packaging and concentration wording.
import { mapConcentration, type Concentration } from './concentration.js';
import { normalizeIdentity } from './identity.js';

export interface BarcodeHint {
  brand: string | null;
  name: string;
  sizeMl: number | null;
  concentration: Concentration | null;
  query: string;
}

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
  const house = brandField ?? knownHouses.find((h) => { const n = normalizeIdentity(h); return !!n && lower.startsWith(`${n} `); }) ?? null;
  if (house) {
    const n = normalizeIdentity(house)!;
    const words = n.split(' ').length;
    if (lower.startsWith(`${n} `)) t = t.split(/\s+/).slice(words).join(' ');
  }
  t = t.split(/\s+[-–|]\s+/)[0]!; // "Name Parfum - Eau de Parfum 100ml" -> "Name Parfum"
  t = t.replace(/\d+(?:[.,]\d+)?\s*(ml|millilit(?:er|re)s?|fl\.?\s*oz|oz)\b/gi, ' ');
  // Trailing concentration / packaging words are labels, not part of the name.
  for (let i = 0; i < 4; i++) t = t.replace(/\s+(eau\s+de\s+parfum|eau\s+de\s+toilette|eau\s+de\s+cologne|extrait|parfum|perfume|spray|vaporisateur|edp|edt|edc)\s*$/i, '');
  const name = t.replace(/\s+/g, ' ').trim();
  return { brand: house, name, sizeMl: sizeMl && sizeMl > 0 && sizeMl < 5000 ? sizeMl : null, concentration: concs.length === 1 ? concs[0]! : null, query: [house, name].filter(Boolean).join(' ') };
}
