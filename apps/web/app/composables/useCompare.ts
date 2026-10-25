// Session-only selection contains canonical IDs, never personal notes.
export function useCompare() {
  const ids = useState<string[]>('compare:ids', () => {
    try { const saved: unknown = JSON.parse(sessionStorage.getItem('fray:compare') ?? '[]'); return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string').slice(0, 2) : []; } catch { return []; }
  });
  function set(next: string[]) { ids.value = next.slice(0, 2); sessionStorage.setItem('fray:compare', JSON.stringify(ids.value)); }
  function add(id: string) { if (!ids.value.includes(id)) set(ids.value.length < 2 ? [...ids.value, id] : [ids.value[0]!, id]); }
  const url = computed(() => `/compare?${new URLSearchParams(Object.fromEntries(ids.value.map((id, i) => [i === 0 ? 'a' : 'b', id])))}`);
  return { ids, set, add, url };
}
