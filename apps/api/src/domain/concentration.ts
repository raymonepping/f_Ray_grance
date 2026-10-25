// Map provider/manufacturer concentration wording to the schema vocabulary.
// Unknown wording is NOT guessed: it maps to null and the original text is kept as a claim.
export const CONCENTRATIONS = [
  'parfum',
  'extrait',
  'elixir',
  'eau_de_parfum',
  'eau_de_toilette',
  'eau_de_cologne',
  'eau_fraiche',
  'body_mist',
  'other',
] as const;
export type Concentration = (typeof CONCENTRATIONS)[number];

const MAP: Record<string, Concentration> = {
  parfum: 'parfum',
  perfume: 'parfum',
  'extrait de parfum': 'extrait',
  extrait: 'extrait',
  elixir: 'elixir',
  'eau de parfum': 'eau_de_parfum',
  edp: 'eau_de_parfum',
  'eau de toilette': 'eau_de_toilette',
  edt: 'eau_de_toilette',
  'eau de cologne': 'eau_de_cologne',
  cologne: 'eau_de_cologne',
  edc: 'eau_de_cologne',
  'eau fraiche': 'eau_fraiche',
  'body mist': 'body_mist',
};

export function mapConcentration(raw: string | null | undefined): Concentration | null {
  if (!raw) return null;
  const k = raw
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return MAP[k] ?? ((CONCENTRATIONS as readonly string[]).includes(k.replace(/ /g, '_')) ? (k.replace(/ /g, '_') as Concentration) : null);
}
