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
  <section class="bay flex flex-col gap-4 p-5" aria-labelledby="recommendations-title">
    <h2 id="recommendations-title">Explore your preferences</h2>
    <p class="m-0 text-[14px] text-ink-2">Suggestions from explicit ratings and seasonal choices. Owning a scent never counts as liking it.</p>
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex min-w-0 flex-col gap-1.5"><label for="discovery-mode" class="text-[13px] font-medium text-ink-2">Direction</label><select id="discovery-mode" v-model="mode" class="field"><option value="similar">Similar to my preferences</option><option value="different">A different direction</option></select></div>
      <div class="flex flex-col gap-1.5"><label for="discovery-season" class="text-[13px] font-medium text-ink-2">Season</label><select id="discovery-season" v-model="season" class="field capitalize"><option value="">All seasons</option><option v-for="s in ['spring','summer','autumn','winter']" :key="s" :value="s">{{ s }}</option></select></div>
      <button type="button" class="btn btn-quiet" @click="load">Refresh suggestions</button>
    </div>
    <p v-if="loading" role="status" class="m-0 text-[13px] text-ink-2">Finding source-backed directions…</p>
    <StatusBanner v-if="error" title="Suggestions unavailable" tone="warning">{{ error }}</StatusBanner>
    <template v-if="result && !loading">
      <p class="m-0 text-[14px] text-ink-2" data-testid="discovery-reason">{{ result.reason }}</p>
      <ul v-if="result.items.length" class="m-0 list-none overflow-hidden rounded-control border border-line p-0">
        <li v-for="item in result.items" :key="item.fragrance.id" class="flex min-w-0 flex-col gap-2 border-b border-line px-4 py-3.5 last:border-b-0 md:flex-row md:items-start md:justify-between md:gap-6">
          <div class="min-w-0">
            <h3 class="text-[15px] font-medium [overflow-wrap:anywhere]"><NuxtLink :to="`/fragrances/${item.fragrance.id}`" class="no-underline hover:underline">{{ item.fragrance.canonical_name }}</NuxtLink> <span class="font-normal text-ink-3">{{ item.fragrance.brand }}</span></h3>
            <p class="m-0 mt-1 text-[14px] text-ink-2">{{ item.reason }}</p>
            <p v-if="mode === 'different' && item.novelNotes.length" class="m-0 mt-1 text-[13px] text-ink-2">A different note direction: {{ item.novelNotes.join(', ') }}</p>
            <p v-if="item.semanticRelatedness !== null" class="m-0 mt-1 text-[12px] text-ink-3">Text semantic relatedness: <span class="readout">{{ item.semanticRelatedness.toFixed(3) }}</span> · not scent equivalence</p>
          </div>
          <NuxtLink :to="`/compare?a=${item.fragrance.id}`" class="btn btn-quiet h-9 min-h-0 shrink-0 self-start"><AppIcon name="columns" :size="15" /> Compare with my library</NuxtLink>
        </li>
      </ul>
      <p v-else class="m-0 text-[14px] text-ink-2">No suggestions with enough evidence yet.</p>
      <p v-if="result.limitation" class="m-0 text-[12px] text-ink-3">{{ result.limitation }}</p>
    </template>
  </section>
</template>
