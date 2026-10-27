<script setup lang="ts">
import { CONCENTRATION_LABEL, isConfirmedIdentity, sourceLabel, type Fragrance } from '~~/shared/types';
import type { Comparison } from '~~/shared/dna';
usePageHeader({ title: 'Compare' });
const route = useRoute(); const router = useRouter(); const selection = useCompare();
const a = ref(''); const b = ref(''); const q = ref('');
const season = ref('');
const options = ref<Fragrance[]>([]); const data = ref<Comparison | null>(null);
const error = ref(''); const loading = ref(false); const expanded = ref(false); const advanced = ref(false);
let version = 0; let searchVersion = 0; let timer: ReturnType<typeof setTimeout> | undefined;
async function search() {
  const v = ++searchVersion;
  try {
    const result = await apiFetch<{ items: Fragrance[] }>(`/api/v1/fragrances?limit=100&query=${encodeURIComponent(q.value)}`);
    if (v === searchVersion) options.value = result.items.filter(f => isConfirmedIdentity(f.identity_status));
  } catch { if (v === searchVersion) error.value = 'Could not search your library. Try again.'; }
}
watch(q, () => { clearTimeout(timer); timer = setTimeout(search, 250); });
const name = (f: Fragrance) => `${f.brand} · ${f.canonical_name} · ${f.concentration ? CONCENTRATION_LABEL[f.concentration] ?? f.concentration : 'Concentration unknown'}`;
function wearLabel(value: unknown) {
  const wear = value as { seasons?: unknown; hours?: unknown } | null;
  const labels = (xs: unknown) => Array.isArray(xs) ? xs.filter((s): s is string => typeof s === 'string').join(', ') : '';
  return [labels(wear?.seasons), labels(wear?.hours)].filter(Boolean).join(' · ') || 'Not listed';
}
async function compare() {
  const v = ++version; data.value = null; error.value = '';
  if (!a.value || !b.value) { loading.value = false; return; }
  if (a.value === b.value) { loading.value = false; error.value = 'Choose two different fragrances.'; return; }
  loading.value = true;
  try {
    const result = await apiFetch<Comparison>('/api/v1/compare', { method: 'POST', body: { fragranceIds: [a.value, b.value],...(season.value?{season:season.value}:{}) } });
    if (v === version) data.value = result;
  } catch (e) { if (v === version) error.value = e instanceof ApiFailure ? e.message : 'Comparison unavailable. Try again.'; }
  finally { if (v === version) loading.value = false; }
}
function setFromRoute() {
  a.value = typeof route.query.a === 'string' ? route.query.a : '';
  b.value = typeof route.query.b === 'string' ? route.query.b : '';
  season.value = typeof route.query.season === 'string' ? route.query.season : '';
  selection.set([a.value, b.value].filter(Boolean)); void compare();
}
watch(() => route.fullPath, setFromRoute);
async function select() {
  selection.set([a.value, b.value].filter(Boolean));
  await router.replace({ path: '/compare', query: { ...(a.value ? { a: a.value } : {}), ...(b.value ? { b: b.value } : {}),...(season.value?{season:season.value}:{}) } });
}
function change(side: string, event: Event) { if (side === 'A') a.value = (event.target as HTMLSelectElement).value; else b.value = (event.target as HTMLSelectElement).value; void select(); }
function swap() { [a.value, b.value] = [b.value, a.value]; void select(); }
function clear() { a.value = ''; b.value = ''; void select(); }
onMounted(async () => {
  await search();
  if (!('a' in route.query) && !('b' in route.query) && selection.ids.value.length) await router.replace(selection.url.value);
  setFromRoute();
});
onBeforeUnmount(() => { clearTimeout(timer); version++; searchVersion++; });
const rows = computed(() => data.value?.fragrances[0].traits.filter((t, i) => i < 5 || (advanced.value && (t.score !== null || data.value!.fragrances[1].traits[i]!.score !== null))).map(t => ({ code: t.code, label: t.label, values: data.value!.fragrances.map(f => f.traits.find(x => x.code === t.code)?.score ?? null) })) ?? []);
</script>
<template>
  <div class="flex min-w-0 flex-col gap-6">
    <div>
      <h1>Compare</h1>
      <p class="m-0 mt-2 text-[15px] text-ink-2">Two verified identities. Source-listed notes and indicative traits, with uncertainty kept visible.</p>
    </div>
    <section class="chrome sticky top-[var(--header-h)] z-20 flex min-w-0 flex-col gap-3 rounded-card border border-line p-3 md:p-4" aria-label="Comparison selectors">
      <div class="grid min-w-0 gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]">
        <div class="flex min-w-0 flex-col gap-1.5">
          <label for="compare-search" class="text-[13px] font-medium text-ink-2">Search your library</label>
          <input id="compare-search" v-model="q" type="search" class="field min-w-0" />
        </div>
        <div class="grid min-w-0 grid-cols-2 gap-3 md:contents">
          <div v-for="side in ['A', 'B']" :key="side" class="flex min-w-0 flex-col gap-1.5">
            <div class="flex items-center gap-2"><span class="readout grid size-5 place-items-center rounded-[4px] border border-line-strong text-[11px] text-ink" aria-hidden="true">{{ side }}</span><label :for="`scent-${side}`" class="text-[13px] font-medium text-ink-2">Scent {{ side }}</label></div>
            <select :id="`scent-${side}`" :value="side === 'A' ? a : b" class="field w-full min-w-0 pr-8" @change="change(side, $event)">
              <option value="">Choose a fragrance</option>
              <option v-for="f in options" :key="f.id" :value="f.id">{{ name(f) }}</option>
              <option v-if="(side === 'A' ? a : b) && !options.some(f => f.id === (side === 'A' ? a : b))" :value="side === 'A' ? a : b">Selected identity (see below)</option>
            </select>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex min-w-0 items-center gap-2 whitespace-nowrap text-[13px] text-ink-2">Personal season<select v-model="season" class="field h-9 min-h-0 w-auto min-w-0 pr-8 capitalize" @change="select"><option value="">All seasons</option><option v-for="s in ['spring','summer','autumn','winter']" :key="s" :value="s">{{ s }}</option></select></label>
        <span class="flex-1" />
        <button type="button" class="btn btn-quiet h-9 min-h-0" @click="swap">Swap A / B</button>
        <button type="button" class="btn btn-ghost h-9 min-h-0" @click="clear">Clear selection</button>
      </div>
    </section>
    <StatusBanner v-if="error" title="Select fragrances or retry" tone="warning">{{ error }} <button type="button" class="underline" @click="compare">Retry</button></StatusBanner>
    <p v-if="loading" role="status" class="readout m-0 text-[13px] text-ink-2">Comparing stored source data…</p>
    <template v-if="data">
      <section class="bay flex flex-col gap-3 p-5 md:p-6" aria-label="What differs?">
        <div class="flex items-center justify-between gap-3">
          <h2>What differs?</h2>
          <AcademyExplainLink concept="notes" />
        </div>
        <p class="m-0 text-[15px]">{{ data.explanation.summary }}</p>
        <dl class="m-0 grid gap-px overflow-hidden rounded-control border border-line bg-line md:grid-cols-2">
          <div class="bg-panel p-4"><dt class="etch">Listed only for A</dt><dd class="m-0 mt-1.5 text-[14px]">{{ data.explanation.uniqueA.map(n => n.label).join(', ') || 'Not enough data' }}</dd></div>
          <div class="bg-panel p-4"><dt class="etch">Listed only for B</dt><dd class="m-0 mt-1.5 text-[14px]">{{ data.explanation.uniqueB.map(n => n.label).join(', ') || 'Not enough data' }}</dd></div>
        </dl>
        <ul v-if="data.explanation.differences.length" class="m-0 flex list-none flex-col gap-1 p-0 text-[14px] text-ink-2"><li v-for="d in data.explanation.differences" :key="d.text">{{ d.text }}</li></ul>
        <p class="m-0 text-[12px] text-ink-3">{{ data.explanation.limitation }}</p>
      </section>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
        <label class="tap inline-flex items-center gap-2"><input v-model="expanded" type="checkbox" class="size-4 accent-[var(--action)]" /> Full source-listed pyramid</label>
        <label class="tap inline-flex items-center gap-2"><input v-model="advanced" type="checkbox" class="size-4 accent-[var(--action)]" /> Extended traits</label>
      </div>
      <div class="grid min-w-0 gap-5 xl:grid-cols-2">
        <article v-for="(f, i) in data.fragrances" :key="f.fragrance.id" class="bay flex min-w-0 flex-col overflow-hidden" :aria-label="`Scent ${i === 0 ? 'A' : 'B'} profile`">
          <div class="flex items-start gap-4 border-b border-line p-5">
            <div class="relative shrink-0">
              <FragranceImage :image-id="f.primaryImageId" :alt="`${f.fragrance.brand} ${f.fragrance.canonical_name}`" size="card" />
              <span class="readout absolute -left-2 -top-2 grid size-6 place-items-center rounded-[6px] border border-line-strong bg-panel text-[12px]" aria-hidden="true">{{ i === 0 ? 'A' : 'B' }}</span>
            </div>
            <div class="min-w-0">
              <h2 class="text-[19px] [overflow-wrap:anywhere]"><NuxtLink :to="`/fragrances/${f.fragrance.id}`" class="no-underline hover:underline">{{ f.fragrance.canonical_name }}</NuxtLink></h2>
              <p class="m-0 mt-1 text-[14px] text-ink-2">{{ f.fragrance.brand }} <span class="text-ink-3">/</span> {{ f.fragrance.concentration ? CONCENTRATION_LABEL[f.fragrance.concentration] : 'Concentration unknown' }}</p>
              <p class="m-0 mt-1 text-[13px] text-ink-3">Your collection: {{ f.collection.map(c => c.state.replaceAll('_', ' ')).join(', ') || 'Not recorded' }}</p>
            </div>
          </div>
          <div class="border-b border-line p-5">
            <FragranceChromatogram v-if="expanded" :pyramid="f.pyramid" :label="`Scent ${i === 0 ? 'A' : 'B'} pyramid`" />
            <FragranceNotePyramid v-else :pyramid="f.pyramid" compact :label="`Scent ${i === 0 ? 'A' : 'B'} pyramid`" />
          </div>
          <div class="flex flex-col gap-3 p-5 text-[14px]">
            <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
              <dt class="etch pt-0.5">Family</dt><dd class="m-0">{{ f.fields.family?.value ?? 'Family not listed' }} <span v-if="f.fields.family" class="readout text-[11px] text-ink-3">{{ sourceLabel(f.fields.family) }}</span></dd>
              <dt class="etch pt-0.5">Seasons</dt>
              <dd class="m-0">
                <span v-if="f.personalSeasons.length">Your choices: {{ f.personalSeasons.map(s => `${s.season}: ${s.affinity}`).join(', ') }}</span>
                <span v-else class="text-ink-2">No personal seasonal preference recorded.</span>
                <span v-if="f.fields.wears" class="block text-[13px] text-ink-3">Provider editorial suggestion: {{ wearLabel(f.fields.wears.value) }}</span>
              </dd>
            </dl>
            <p class="m-0 text-ink-2 [overflow-wrap:anywhere]">{{ f.fields.character?.value ?? 'Character not available.' }}</p>
          </div>
          <div class="mt-auto border-t border-line [&>details]:rounded-none [&>details]:border-0"><FragranceSourceAttribution :fields="f.fields" /></div>
        </article>
      </div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3 px-1"><h2>Scent traits</h2><AcademyExplainLink concept="traits" /></div>
        <FragranceScentTraitBars :rows="rows" :series="['Scent A', 'Scent B']" :method="data.method" />
      </div>
      <details class="bay p-5"><summary class="tap cursor-pointer font-medium">How indicative traits are derived</summary>
        <p class="text-[14px] text-ink-2">{{ data.fragrances[0].limitation }} Each score is the maximum expression in the versioned rule table among matching source-listed notes.</p>
        <ul class="m-0 flex flex-col gap-1 pl-5 text-[13px] text-ink-2"><li v-for="t in data.fragrances[0].traits.filter(t => t.score !== null)" :key="t.code">Scent A · {{ t.label }}: {{ t.evidence.map(e => `${e.label} (${e.expression})`).join(', ') }}</li><li v-for="t in data.fragrances[1].traits.filter(t => t.score !== null)" :key="`b-${t.code}`">Scent B · {{ t.label }}: {{ t.evidence.map(e => `${e.label} (${e.expression})`).join(', ') }}</li></ul>
      </details>
    </template>
    <EmptyState v-else-if="!loading && !error" icon="columns" title="Choose two fragrances" body="Search your saved library, then choose Scent A and Scent B. Add verified identities through Discover if needed." action-label="Find a fragrance" action-to="/discover" />
  </div>
</template>
