// Single navigation source (spec/DESIGN.md §5, §13): sidebar, rail, bottom nav and drawer
// all render from this list. Primary = the four main journeys.
export type IconName = 'library' | 'compass' | 'columns' | 'dna' | 'settings' | 'flask';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  primary: boolean;
  description: string;
}

export const NAVIGATION: readonly NavItem[] = [
  { to: '/collection', label: 'Collection', icon: 'library', primary: true, description: 'Owned, previous, samples, wishlist and rejected' },
  { to: '/discover', label: 'Discover', icon: 'compass', primary: true, description: 'Search, verify and add exact fragrances' },
  { to: '/compare', label: 'Compare', icon: 'columns', primary: true, description: 'Two fragrances side by side' },
  { to: '/dna', label: 'My DNA', icon: 'dna', primary: true, description: 'Seasonal preferences' },
  { to: '/collection?state=sampled', label: 'Samples', icon: 'flask', primary: false, description: 'Testers and decants you have tried' },
  { to: '/settings', label: 'Settings', icon: 'settings', primary: false, description: 'Appearance, session, data and status' },
] as const;

export const PRIMARY_NAV = NAVIGATION.filter((n) => n.primary);
export const SECONDARY_NAV = NAVIGATION.filter((n) => !n.primary);

/** Active when the path matches (query-specific entries match their query too). */
export function isActive(item: NavItem, path: string, query: Record<string, unknown>): boolean {
  const [base, qs] = item.to.split('?');
  if (!path.startsWith(base!)) return false;
  if (!qs) return !(base === '/collection' && query.state === 'sampled');
  const [k, v] = qs.split('=');
  return query[k!] === v;
}
