// Normalisation of Scento educational folios (Phase 11, spec/SCENT_ACADEMY_SPEC.md).
// Provider text is untrusted: it is reduced to bounded plain text, links are kept only
// when they point at https://www.scento.com, and no provider HTML is ever passed on.
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { SourceError } from './scento.js';

export type EducationalKind = 'material' | 'term' | 'family' | 'families' | 'journal';

export interface EducationalFolio {
  kind: EducationalKind;
  folio: string;
  title: string;
  lede: string;
  facts: { label: string; value: string }[];
  related: { label: string; detail: string | null; url: string | null }[];
  sourceUrl: string | null;
  sourceLabel: string;
  attribution: string;
  language: 'en';
  fetchedAt: string;
}

const EXPECTED: Record<EducationalKind, string> = {
  material: 'note-portrait',
  term: 'perfumery-lexicon',
  family: 'family-map',
  families: 'family-map',
  journal: 'journal-search',
};

const Envelope = Type.Object({
  folio: Type.String(),
  lede: Type.String(),
  detail: Type.Record(Type.String(), Type.Unknown()),
  scento_page: Type.Union([Type.Object({ label: Type.String(), url: Type.String() }), Type.Null()]),
  further_reading: Type.Union([Type.Array(Type.Object({ label: Type.String(), url: Type.String() })), Type.Null()]),
  cite: Type.String(),
});

/** Public concept terms only: letters, digits, spaces, '&' and '-'; mapped to a provider slug. */
export function educationalSlug(term: string): string | null {
  if (!/^[\p{L}\p{N} &'-]{1,80}$/u.test(term.trim())) return null;
  const slug = term
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.length > 0 && slug.length <= 80 ? slug : null;
}

/** Bounded plain text: no tags, no control characters, collapsed whitespace. */
export function plain(v: unknown, max = 600): string {
  if (typeof v !== 'string') return '';
  const t = v
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Only https links on www.scento.com survive; everything else becomes null. */
export function safeScentoUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === 'www.scento.com' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

const list = (v: unknown, max = 12): string[] => (Array.isArray(v) ? v.map((x) => plain(x, 80)).filter(Boolean).slice(0, max) : []);
const fact = (label: string, value: unknown, max?: number) => {
  const v = Array.isArray(value) ? list(value).join(', ') : plain(value, max);
  return v ? [{ label, value: v }] : [];
};
const refs = (v: unknown, max = 8) =>
  Array.isArray(v)
    ? v.slice(0, max).flatMap((x) => {
        if (!x || typeof x !== 'object') return [];
        const o = x as Record<string, unknown>;
        const label = plain(o.name ?? o.title ?? o.label, 120);
        if (!label) return [];
        const house = plain(o.house, 80);
        return [{ label: house ? `${label}, ${house}` : label, detail: plain(o.summary ?? o.definition, 300) || null, url: safeScentoUrl(o.page ?? o.url) }];
      })
    : [];

export function normalizeFolio(kind: EducationalKind, body: unknown, fetchedAt: Date): EducationalFolio {
  if (!Value.Check(Envelope, body)) throw new SourceError('SOURCE_SCHEMA_CHANGED', 'unexpected Scento folio envelope');
  const b = body as Static<typeof Envelope>;
  if (b.folio !== EXPECTED[kind]) throw new SourceError('SOURCE_SCHEMA_CHANGED', `expected ${EXPECTED[kind]} folio, got ${plain(b.folio, 40)}`);
  const d = b.detail;
  let title = '';
  let facts: EducationalFolio['facts'] = [];
  let related: EducationalFolio['related'] = [];
  if (kind === 'material') {
    title = plain(d.name, 80);
    facts = [
      ...fact('Smells like', d.smells_like),
      ...fact('Family', d.family),
      ...fact('Scento family', d.scento_family),
      ...fact('Origin', d.natural_or_synthetic),
      ...fact('Pairs well with', d.pairs_well_with),
      ...fact('Also called', list(d.aliases, 6)),
    ];
    related = refs(d.showcased_in);
  } else if (kind === 'term') {
    title = plain(d.term, 80);
    facts = [...fact('Meaning', d.meaning, 900), ...fact('Related terms', d.related_terms)];
    related = refs(d.example_perfumes);
  } else if (kind === 'family') {
    title = plain(d.family, 80);
    facts = [...fact('Definition', d.definition, 900), ...fact('Subfamilies', d.subfamilies), ...fact('Neighbouring families', list(d.neighbouring_families))];
    related = refs(d.exemplars);
  } else if (kind === 'families') {
    title = 'Scento family map';
    related = Array.isArray(d.tree)
      ? d.tree.slice(0, 20).flatMap((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          const name = plain(o.name, 80);
          const id = typeof o.id === 'string' && /^[a-z0-9-]{1,60}$/.test(o.id) ? o.id : null;
          return name ? [{ label: name, detail: plain(o.definition, 300) || null, url: id ? `family:${id}` : null }] : [];
        })
      : [];
  } else {
    title = `Further reading: ${plain(d.query, 80)}`;
    related = refs(d.articles, 6);
  }
  if (!title) throw new SourceError('SOURCE_SCHEMA_CHANGED', 'folio without a usable title');
  return {
    kind,
    folio: b.folio,
    title,
    lede: plain(b.lede, 600),
    facts,
    related,
    sourceUrl: safeScentoUrl(b.scento_page?.url),
    sourceLabel: plain(b.scento_page?.label, 160) || 'Scento',
    attribution: plain(b.cite, 120) || 'Scento Perfume API, scento.com',
    language: 'en',
    fetchedAt: fetchedAt.toISOString(),
  };
}
