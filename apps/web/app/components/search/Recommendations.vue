<script setup lang="ts">
import type { Fragrance } from '~~/shared/types';
interface Suggestions { items: { fragrance: Fragrance; reason: string; novelNotes: string[]; semanticRelatedness: number | null }[]; engine: string; reason: string; limitation?: string }
const mode = ref('similar'); const season = ref(typeof useRoute().query.season === 'string' ? String(useRoute().query.season) : ''); const result = ref<Suggestions | null>(null); const error = ref(''); const loading = ref(false);
let version = 0;
async function load() {
  const v = ++version; loading.value = true; error.value = '';
  try { const r = await apiFetch<Suggestions>(`/api/v1/discover?mode=${mode.value}${season.value ? `&season=${season.value}` : ''}`); if (v === version) result.value = r; }
  catch (e) { if (v === version) error.value = e instanceof ApiFailure ? e.message : 'Recommendations unavailable.'; }
  finally { if (v === version) loading.value = false; }
}
watch([mode, season], load); onMounted(load); onBeforeUnmount(() => { version++; });
</script>
<template>
  <section class="surface-solid flex flex-col gap-4 rounded-card p-4 md:p-5" aria-labelledby="recommendations-title">
    <h2 id="recommendations-title">Explore your preferences</h2>
    <p class="m-0 text-ink-2">Suggestions from explicit ratings and seasonal choices. Owning a scent never counts as liking it.</p>
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex min-w-0 flex-col gap-1"><label for="discovery-mode">Direction</label><select id="discovery-mode" v-model="mode" class="tap rounded-control border border-line bg-sunken px-3"><option value="similar">Similar to my preferences</option><option value="different">A different direction</option></select></div>
      <div class="flex flex-col gap-1"><label for="discovery-season">Season</label><select id="discovery-season" v-model="season" class="tap rounded-control border border-line bg-sunken px-3"><option value="">All seasons</option><option v-for="s in ['spring','summer','autumn','winter']" :key="s" :value="s">{{ s }}</option></select></div>
      <button type="button" class="tap rounded-control border border-line px-3" @click="load">Refresh suggestions</button>
    </div>
    <p v-if="loading" role="status">Finding source-backed directions…</p>
    <StatusBanner v-if="error" title="Suggestions unavailable" tone="warning">{{ error }}</StatusBanner>
    <template v-if="result && !loading">
      <p class="m-0 text-sm text-ink-2" data-testid="discovery-reason">{{ result.reason }}</p>
      <ul v-if="result.items.length" class="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
        <li v-for="item in result.items" :key="item.fragrance.id" class="min-w-0 rounded-control border border-line p-3">
          <h3 class="[overflow-wrap:anywhere]"><NuxtLink :to="`/fragrances/${item.fragrance.id}`">{{ item.fragrance.brand }} · {{ item.fragrance.canonical_name }}</NuxtLink></h3>
          <p>{{ item.reason }}</p>
          <p v-if="mode === 'different' && item.novelNotes.length" class="text-sm">A different note direction: {{ item.novelNotes.join(', ') }}</p>
          <p v-if="item.semanticRelatedness !== null" class="text-sm text-ink-2">Text semantic relatedness: {{ item.semanticRelatedness.toFixed(3) }} · not scent equivalence</p>
          <NuxtLink :to="`/compare?a=${item.fragrance.id}`">Compare with my library</NuxtLink>
        </li>
      </ul>
      <p v-else class="m-0">No suggestions with enough evidence yet.</p>
      <p v-if="result.limitation" class="m-0 text-xs text-ink-2">{{ result.limitation }}</p>
    </template>
  </section>
</template>
