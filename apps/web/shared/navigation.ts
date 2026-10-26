// Single navigation source (spec/DESIGN.md §5, §13; ADR-015): sidebar, rail, bottom nav and drawer
// all render from this list. Items are grouped by purpose and shown with dividers between groups;
// primary = the four main journeys of the spec (and the mobile bottom navigation), in spec order.
export type IconName = 'library' | 'compass' | 'columns' | 'dna' | 'settings' | 'flask' | 'academy' | 'spectrum';
export type NavGroup = 'collection' | 'explore' | 'profile' | 'learn' | 'utility';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  primary: boolean;
  group: NavGroup;
  description: string;
}

/** Group order and accessible names (no visible eyebrow labels; dividers separate groups). */
export const NAV_GROUPS: readonly { key: NavGroup; label: string }[] = [
  { key: 'collection', label: 'Your collection' },
  { key: 'explore', label: 'Find and compare' },
  { key: 'profile', label: 'Your profile' },
  { key: 'learn', label: 'Learn' },
  { key: 'utility', label: 'Settings' },
];

export const NAVIGATION: readonly NavItem[] = [
  { to: '/collection', label: 'Collection', icon: 'library', primary: true, group: 'collection', description: 'Owned, previous, samples, wishlist and rejected' },
  { to: '/collection?state=sampled', label: 'Samples', icon: 'flask', primary: false, group: 'collection', description: 'Testers and decants you have tried' },
  { to: '/discover', label: 'Discover', icon: 'compass', primary: true, group: 'explore', description: 'Search, verify and add exact fragrances' },
  { to: '/compare', label: 'Compare', icon: 'columns', primary: true, group: 'explore', description: 'Two fragrances side by side' },
  { to: '/dna', label: 'My DNA', icon: 'dna', primary: true, group: 'profile', description: 'Seasonal preferences' },
  { to: '/spectrum', label: 'My Spectrum', icon: 'spectrum', primary: false, group: 'profile', description: 'Where the fragrances you own sit' },
  { to: '/academy', label: 'Academy', icon: 'academy', primary: false, group: 'learn', description: 'Lessons, glossary and Train My Nose' },
  { to: '/settings', label: 'Settings', icon: 'settings', primary: false, group: 'utility', description: 'Appearance, session, data and status' },
] as const;

export const PRIMARY_NAV = NAVIGATION.filter((n) => n.primary);
/** Main groups in order (sidebar body, drawer), each with its items; utility is rendered apart. */
export const MAIN_GROUPS = NAV_GROUPS.filter((g) => g.key !== 'utility').map((g) => ({ ...g, items: NAVIGATION.filter((n) => n.group === g.key) }));
export const UTILITY_NAV = NAVIGATION.filter((n) => n.group === 'utility');

/** Active when the path matches (query-specific entries match their query too). */
export function isActive(item: NavItem, path: string, query: Record<string, unknown>): boolean {
  const [base, qs] = item.to.split('?');
  if (!path.startsWith(base!)) return false;
  if (!qs) return !(base === '/collection' && query.state === 'sampled');
  const [k, v] = qs.split('=');
  return query[k!] === v;
}
