// My Spectrum (Phase 13, spec/SPECTRUM_SPEC.md). Pure: where the owner's collection sits on two
// bipolar scent spectrums, a trait readout and a family breakdown. Inputs are the existing
// indicative traits (sourced-notes method); unknown stays unknown and never counts as 0. It
// describes what the collection covers; ownership is not liking, and ratings are never used.
import { LABEL, TRAITS, TRAIT_METHOD, type Trait } from './dna.js';

export const SPECTRUM_METHOD = 'spectrum-v1';

export const AXES = [
  { code: 'fresh_warm', label: 'Fresh ↔ Warm', left: { label: 'Fresh', traits: ['fresh', 'green', 'marine_mineral'] }, right: { label: 'Warm', traits: ['warm', 'spicy', 'smoky'] } },
  { code: 'dry_sweet', label: 'Dry ↔ Sweet', left: { label: 'Dry', traits: ['woody', 'aromatic'] }, right: { label: 'Sweet', traits: ['sweet', 'gourmand', 'fruity'] } },
] as const satisfies readonly { code: string; label: string; left: { label: string; traits: readonly Trait[] }; right: { label: string; traits: readonly Trait[] } }[];

export interface SpectrumInput {
  id: string;
  brand: string;
  name: string;
  family: string | null;
  traits: Partial<Record<Trait, number | null>>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const known = (f: SpectrumInput, ts: readonly Trait[]) => ts.map((t) => f.traits[t]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

/** Position of one fragrance on an axis in [-1, 1], or null when either pole has no known trait. */
export function positionOn(axis: (typeof AXES)[number], f: SpectrumInput): number | null {
  const l = mean(known(f, axis.left.traits));
  const r = mean(known(f, axis.right.traits));
  if (l === null || r === null) return null;
  return round(Math.max(-1, Math.min(1, (r - l) / 5)));
}

export function computeSpectrum(items: SpectrumInput[]) {
  const total = items.length;
  const axes = AXES.map((axis) => {
    const placed = items.flatMap((f) => {
      const p = positionOn(axis, f);
      return p === null ? [] : [{ id: f.id, brand: f.brand, name: f.name, position: p }];
    });
    const positions = placed.map((p) => p.position);
    const m = mean(positions);
    return {
      code: axis.code,
      label: axis.label,
      left: axis.left,
      right: axis.right,
      position: m === null ? null : round(m),
      spread: positions.length ? { min: Math.min(...positions), max: Math.max(...positions) } : null,
      placed: placed.length,
      total,
      fragrances: placed,
      notPlaced: items.filter((f) => positionOn(axis, f) === null).map((f) => ({ id: f.id, brand: f.brand, name: f.name })),
    };
  });
  const traits = TRAITS.map((code) => {
    const vals = items.map((f) => f.traits[code]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const m = mean(vals);
    return { code, label: LABEL[code], mean: m === null ? null : round(m, 2), known: vals.length, total };
  });
  const families = new Map<string, number>();
  let unknownFamily = 0;
  for (const f of items) {
    const fam = f.family?.trim();
    if (fam) families.set(fam, (families.get(fam) ?? 0) + 1);
    else unknownFamily++;
  }
  return {
    method: SPECTRUM_METHOD,
    traitMethod: TRAIT_METHOD,
    total,
    axes,
    traits,
    families: [...families.entries()].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count || a.family.localeCompare(b.family)),
    unknownFamily,
    limitation:
      'Positions are a descriptive heuristic over indicative traits derived from source-listed notes; they are not measurements and not a statement of what you like. Unknown traits are left out, never counted as zero.',
  };
}
