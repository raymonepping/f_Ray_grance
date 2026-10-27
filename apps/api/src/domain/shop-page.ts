// Shop pages as identity evidence (ADR-023). Pure functions: the allow-list check and the parser for
// a fetched product page. The owner confirms the result before anything is saved.
import { canonicalBrand } from './brands.js';
import { mapConcentration, type Concentration } from './concentration.js';

export interface ShopPage {
  shop: string;
  url: string;
  brand: string;
  name: string;
  concentration: Concentration | null;
  concentrationRaw: string | null;
  notes: { top: string[] | null; heart: string[] | null; base: string[] | null };
  /** The EAN printed on the page, which belongs to the size shown there. */
  pageEan: string | null;
}

interface ShopRule {
  name: string;
  hosts: string[];
  path: RegExp;
}

const SHOPS: ShopRule[] = [{ name: 'ICI PARIS XL', hosts: ['www.iciparisxl.nl', 'www.iciparisxl.be'], path: /^\/([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)\/p\/(BP_\d{3,12})\/?$/ }];

/** The allow-listed shop and path parts for a URL, or the reason it is refused. */
export function shopFor(raw: string): { shop: ShopRule; url: string; brandSlug: string; productSlug: string; typeSlug: string } | { refused: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { refused: 'That is not a valid URL.' };
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return { refused: 'Only plain https shop URLs are accepted.' };
  const shop = SHOPS.find((s) => s.hosts.includes(u.hostname.toLowerCase()));
  if (!shop) return { refused: 'Only ICI PARIS XL product pages (iciparisxl.nl or .be) are supported.' };
  const m = shop.path.exec(u.pathname);
  if (!m) return { refused: `That is not an ${shop.name} product page (…/brand/product/type/p/BP_…).` };
  return { shop, url: `https://${u.hostname.toLowerCase()}${u.pathname}`, brandSlug: m[1]!, productSlug: m[2]!, typeSlug: m[3]! };
}

const clean = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
const fromSlug = (s: string) => titleCase(s.replace(/-/g, ' '));

function noteList(text: string, label: string): string[] | null {
  const m = new RegExp(`${label}\\s*:\\s*([^|\\n]+)`, 'i').exec(text);
  if (!m) return null;
  const list = [...new Set(m[1]!.split(',').map((n) => titleCase(clean(n))).filter((n) => n.length >= 2 && n.length <= 80))];
  return list.length ? list.slice(0, 40) : null;
}

/** Parse a fetched product page (TinyFish html) into an evidence preview. */
export function parseShopPage(raw: string, page: { title: string; html: string }): ShopPage | { refused: string } {
  const s = shopFor(raw);
  if ('refused' in s) return s;
  // Visible text with each element on its own line, so labels such as "Topnoten:" end at the element.
  const lines = page.html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map(clean)
    .filter(Boolean)
    .join('\n');
  // Brand from the URL path (canonical house); name from the title's first segment without the brand
  // and a repeated product type ("RABANNE Phantom Parfum Parfum | Parfum | ICI PARIS XL").
  const brand = canonicalBrand(fromSlug(s.brandSlug));
  const segments = clean(page.title).split(/\s+\|\s+/);
  const typeRaw = clean(segments[1] ?? '') || fromSlug(s.typeSlug);
  let name = clean(segments[0] ?? '');
  for (const b of [brand, fromSlug(s.brandSlug)]) if (name.toLowerCase().startsWith(`${b.toLowerCase()} `)) name = name.slice(b.length).trim();
  if (typeRaw && name.toLowerCase().endsWith(` ${typeRaw.toLowerCase()}`)) name = name.slice(0, -typeRaw.length).trim();
  if (!name) name = fromSlug(s.productSlug);
  const notes = { top: noteList(lines, 'Topnoten'), heart: noteList(lines, 'Hartnoten'), base: noteList(lines, 'Basisnoten') };
  const ean = /EAN\s*code\s*:\s*(\d{8,14})/i.exec(lines)?.[1] ?? null;
  if (name === name.toUpperCase()) name = titleCase(name); // shops often shout names
  return { shop: s.shop.name, url: s.url, brand, name, concentration: mapConcentration(typeRaw), concentrationRaw: typeRaw || null, notes, pageEan: ean };
}
