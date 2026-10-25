import type { EffectiveField, Fragrance, Pyramid } from './types';
export interface DnaProfile {
  fragrance: Fragrance;
  fields: Record<string, EffectiveField>;
  pyramid: Pyramid;
  traits: { code: string; label: string; score: number | null; evidence: { label: string; expression: number }[] }[];
  method: string;
  limitation: string;
  collection: { state: string }[];
  personalSeasons: { season: string; affinity: string }[];
}
export interface Comparison {
  fragrances: [DnaProfile, DnaProfile]; method: string;
  explanation: { shared: { key: string; label: string }[]; uniqueA: { key: string; label: string }[]; uniqueB: { key: string; label: string }[]; differences: { text: string }[]; limitation: string; summary: string };
}
