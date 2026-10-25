// Pages declare their header (title, breadcrumbs, the single primary action); the layout renders it.
export interface PageHeader {
  title: string;
  crumbs?: { label: string; to?: string }[];
  action?: { label: string; to: string };
}
export function usePageHeader(h?: PageHeader) {
  const header = useState<PageHeader>('page:header', () => ({ title: 'F-Ray-grance' }));
  if (h) {
    header.value = h;
    useHead({ title: `${h.title} · F-Ray-grance` });
  }
  return header;
}
