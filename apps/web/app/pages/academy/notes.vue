<script setup lang="ts">
// Note explorer: on-demand Scento material lookups. Suggestions come from the owner's own
// sourced pyramids (read locally), plus a few common teaching materials.
usePageHeader({ title: 'Note explorer', crumbs: [{ label: 'Academy', to: '/academy' }, { label: 'Note explorer' }] });
useHead({ title: 'Note explorer · Scent Academy' });
const route = useRoute();
const initial = typeof route.query.q === 'string' ? route.query.q : '';
const mine = ref<string[]>([]);
onMounted(async () => {
  try {
    const r = await apiFetch<{ items: { pyramid?: { top?: string[]; heart?: string[]; base?: string[] } | null }[] }>('/api/v1/collection');
    const seen = new Set<string>();
    for (const e of r.items) for (const t of ['top', 'heart', 'base'] as const) for (const n of e.pyramid?.[t] ?? []) if (/^[A-Za-z0-9 &'-]{1,80}$/.test(n)) seen.add(n);
    mine.value = [...seen].slice(0, 12);
  } catch {
    mine.value = [];
  }
});
const suggestions = computed(() => (mine.value.length ? mine.value : ['Lavender', 'Vetiver', 'Bergamot', 'Vanilla', 'Iris', 'Sandalwood']));
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1>Note explorer</h1>
      <p class="m-0 mt-2 max-w-[60ch] text-[15px] text-ink-2">Look up a material or note in the Scento reference. A note name describes an impression; this reference explains the material behind it.</p>
    </div>
    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <AcademyReferenceLookup kind="material" label="Material or note" placeholder="e.g. Lavender" :suggestions="suggestions" :initial="initial" :auto="!!initial" />
      <aside class="bay flex h-fit flex-col gap-3 p-5" aria-labelledby="notes-learn">
        <h2 id="notes-learn" class="text-[15px]">Material, note or accord?</h2>
        <p class="m-0 text-[13px] text-ink-2">A note list is not an ingredient disclosure. The lesson explains the difference.</p>
        <AcademyExplainLink concept="notes" class="self-start" />
      </aside>
    </div>
  </div>
</template>
