// Auditable, deliberately sparse note rules. No evidence means unknown, never 0.
// These indicate descriptor expression, not measured odour or calibrated similarity.
import { normalizeIdentity } from './identity.js';
import type { EffectiveField } from '../repo/enrichment.js';

export const TRAIT_METHOD = 'sourced-notes-v1';
export const TRAITS = ['sweet', 'fresh', 'spicy', 'woody', 'warm', 'aromatic', 'fruity', 'gourmand', 'smoky', 'green', 'marine_mineral'] as const;
export type Trait = (typeof TRAITS)[number];
export const LABEL: Record<Trait, string> = { sweet: 'Sweet', fresh: 'Fresh', spicy: 'Spicy', woody: 'Woody', warm: 'Warm', aromatic: 'Aromatic', fruity: 'Fruity', gourmand: 'Gourmand', smoky: 'Smoky', green: 'Green', marine_mineral: 'Marine / mineral' };
const ALIASES: Record<string, string> = { cedarwood: 'cedar', 'vanilla bean': 'vanilla', 'bergamot orange': 'bergamot', 'sea salt': 'salt' };
export const noteKey = (s: string): string => { const k = normalizeIdentity(s) ?? ''; return ALIASES[k] ?? k; };
export const NOTE_RULES: Record<string, Partial<Record<Trait, number>>> = {
  vanilla: { sweet: 4, warm: 4, gourmand: 4 }, tonka: { sweet: 3, warm: 3, gourmand: 3 }, 'tonka bean': { sweet: 3, warm: 3, gourmand: 3 },
  benzoin: { sweet: 3, warm: 4 }, amber: { warm: 4 }, saffron: { spicy: 3, warm: 3 }, cinnamon: { spicy: 4, warm: 4 },
  pepper: { spicy: 4 }, 'black pepper': { spicy: 4 }, 'pink pepper': { spicy: 3 }, ginger: { spicy: 3, fresh: 3 }, cardamom: { spicy: 3, aromatic: 3 },
  bergamot: { fresh: 4 }, lemon: { fresh: 4 }, grapefruit: { fresh: 4, fruity: 3 }, mandarin: { fresh: 3, fruity: 3 },
  lavender: { aromatic: 4, fresh: 3 }, rosemary: { aromatic: 4, green: 3 }, mint: { fresh: 4, green: 3 },
  cedar: { woody: 4 }, sandalwood: { woody: 4, warm: 3 }, vetiver: { woody: 3, green: 3 }, oud: { woody: 4, warm: 3 },
  plum: { fruity: 4, sweet: 3 }, apple: { fruity: 4, fresh: 3 }, pear: { fruity: 4 }, peach: { fruity: 4 },
  caramel: { sweet: 5, gourmand: 5 }, chocolate: { sweet: 4, gourmand: 5 }, coffee: { gourmand: 4 },
  smoke: { smoky: 4 }, incense: { smoky: 3, warm: 3 }, 'birch tar': { smoky: 4 },
  'green tea': { green: 3 }, 'violet leaf': { green: 4 }, 'sea notes': { marine_mineral: 4, fresh: 3 }, 'mineral accord': { marine_mineral: 4 }, salt: { marine_mineral: 3 },
};
export interface Pyramid { top: string[] | null; heart: string[] | null; base: string[] | null }
export function pyramidFrom(fields: Record<string, EffectiveField>): Pyramid {
  const p = fields.pyramid?.value as Partial<Pyramid> | undefined;
  const tier = (k: keyof Pyramid) => Array.isArray(p?.[k]) ? p[k]!.filter((s): s is string => typeof s === 'string') : null;
  return { top: tier('top'), heart: tier('heart'), base: tier('base') };
}
export function deriveDna(fields: Record<string, EffectiveField>) {
  const pyramid = pyramidFrom(fields);
  // Untiered notes a source lists (no pyramid given) still count as known notes; tiers are never invented.
  const listed = Array.isArray(fields.listed_notes?.value) ? (fields.listed_notes!.value as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const notes = [...new Map([...Object.values(pyramid).flatMap((x) => x ?? []), ...listed].map((label) => [noteKey(label), { key: noteKey(label), label }])).values()];
  const traits = TRAITS.map((code) => {
    const evidence = notes.flatMap((n) => NOTE_RULES[n.key]?.[code] === undefined ? [] : [{ ...n, expression: NOTE_RULES[n.key]![code]! }]);
    return { code, label: LABEL[code], score: evidence.length ? Math.max(...evidence.map((n) => n.expression)) : null,
      method: TRAIT_METHOD, confidenceState: evidence.length ? 'estimated' : 'unknown', evidence,
      source: fields.pyramid ?? fields.listed_notes ?? null };
  });
  return { pyramid, notes, traits, method: TRAIT_METHOD,
    limitation: 'Indicative 0–5 descriptor expression from known notes. Unmapped or unlisted descriptors remain unknown; note order is not concentration.' };
}
export function contrast(a: ReturnType<typeof deriveDna>, b: ReturnType<typeof deriveDna>) {
  const ak = new Set(a.notes.map((n) => n.key)); const bk = new Set(b.notes.map((n) => n.key));
  const shared = a.notes.filter((n) => bk.has(n.key));
  const uniqueA = a.notes.filter((n) => !bk.has(n.key)); const uniqueB = b.notes.filter((n) => !ak.has(n.key));
  const differences = a.traits.flatMap((t, i) => {
    const other = b.traits[i]!;
    return t.score !== null && other.score !== null && t.score !== other.score
      ? [{ trait: t.code, higher: t.score > other.score ? 'A' : 'B', text: `Scent ${t.score > other.score ? 'A' : 'B'} has a higher indicative ${t.label.toLowerCase()} descriptor score.`, evidenceA: t.evidence, evidenceB: other.evidence }] : [];
  }).slice(0, 3);
  return { shared, uniqueA, uniqueB, differences,
    limitation: 'A note not listed on one side is not proof of its absence. Only comparable known trait scores are contrasted.',
    summary: shared.length ? `Both source note lists include ${shared.map((n) => n.label).join(', ')}.` : 'Insufficient shared source data for a reliable similarity conclusion.' };
}
