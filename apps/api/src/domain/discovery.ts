import { createHash } from 'node:crypto';
import type { EffectiveField } from '../repo/enrichment.js';
import type { FragranceRow } from '../repo/catalog.js';
import { deriveDna, noteKey } from './dna.js';

export const INPUT_REVISION = 'canonical-descriptors-v1';
// Intentionally exclude every personal table and user-entered claim. The local
// model receives canonical public source descriptors only, never private annotations.
export function embeddingInput(f: FragranceRow, fields: Record<string, EffectiveField>) {
  const publicFields = Object.fromEntries(Object.entries(fields).filter(([k, v]) => ['family', 'subfamily', 'pyramid', 'character'].includes(k) && ['official', 'provider'].includes(v.origin)));
  const text = JSON.stringify({ brand: f.brand, name: f.canonical_name, concentration: f.concentration, descriptors: Object.fromEntries(Object.entries(publicFields).map(([k, v]) => [k, v.value])) });
  return { text, hash: createHash('sha256').update(`${INPUT_REVISION}\n${text}`).digest('hex') };
}
export const overlap = (a: string[], b: string[]) => { const x = new Set(a); const y = new Set(b); const union = new Set([...x, ...y]); return union.size ? [...x].filter(n => y.has(n)).length / union.size : 0; };
export interface CandidateEvidence { id: string; notes: string[]; family: string | null }
export function rankCandidate(candidate: CandidateEvidence, anchors: CandidateEvidence[], liked: string[], avoided: string[], mode: 'similar' | 'different', semantic: number | null) {
  const rejected = candidate.notes.some(n => avoided.map(noteKey).includes(n));
  const best = Math.max(0, ...anchors.map(a => overlap(candidate.notes, a.notes)));
  const preferenceOverlap = overlap(candidate.notes, liked.map(noteKey));
  const familyFit = anchors.some(a => a.family && a.family === candidate.family) ? 1 : 0;
  const structured = Math.max(best, preferenceOverlap);
  const fit = Math.max(structured, familyFit * 0.25);
  // Difference is bounded by meaningful preference fit, never pure unrelatedness.
  const eligible = !rejected && fit > 0;
  const closeness = semantic === null ? structured : 0.7 * structured + 0.3 * Math.max(0, Math.min(1, semantic));
  const rank = mode === 'similar' ? 0.8 * closeness + 0.2 * familyFit : 0.65 * fit + 0.35 * (1 - closeness);
  return { eligible, rank, structuredOverlap: structured, semanticRelatedness: semantic,
    reason: rejected ? 'Contains an explicitly avoided note.' : !eligible ? 'No evidence of fit with explicit preferences.' : `${mode === 'different' ? 'A different direction with' : 'Shares'} ${structured > 0 ? 'source-listed notes' : 'a source-listed family'} from your explicit preferences.`,
    novelNotes: candidate.notes.filter(n => !anchors.some(a => a.notes.includes(n)) && !liked.map(noteKey).includes(n)) };
}
export function candidateEvidence(f: FragranceRow, fields: Record<string, EffectiveField>): CandidateEvidence {
  return { id: f.id, notes: deriveDna(fields).notes.map(n => n.key), family: typeof fields.family?.value === 'string' ? fields.family.value : null };
}
