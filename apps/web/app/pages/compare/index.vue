<script setup lang="ts">
import { CONCENTRATION_LABEL, type Fragrance } from '~~/shared/types';
import type { Comparison } from '~~/shared/dna';
usePageHeader({ title: 'Compare' });
const route = useRoute(); const router = useRouter(); const selection = useCompare();
const a = ref(''); const b = ref(''); const q = ref('');
const options = ref<Fragrance[]>([]); const data = ref<Comparison | null>(null);
const error = ref(''); const loading = ref(false); const expanded = ref(false); const advanced = ref(false);
let version = 0; let searchVersion = 0; let timer: ReturnType<typeof setTimeout> | undefined;
async function search() {
  const v = ++searchVersion;
  try {
    const result = await apiFetch<{ items: Fragrance[] }>(`/api/v1/fragrances?limit=100&query=${encodeURIComponent(q.value)}`);
    if (v === searchVersion) options.value = result.items.filter(f => f.identity_status === 'verified');
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
    const result = await apiFetch<Comparison>('/api/v1/compare', { method: 'POST', body: { fragranceIds: [a.value, b.value] } });
    if (v === version) data.value = result;
  } catch (e) { if (v === version) error.value = e instanceof ApiFailure ? e.message : 'Comparison unavailable. Try again.'; }
  finally { if (v === version) loading.value = false; }
}
function setFromRoute() {
  a.value = typeof route.query.a === 'string' ? route.query.a : '';
  b.value = typeof route.query.b === 'string' ? route.query.b : '';
  selection.set([a.value, b.value].filter(Boolean)); void compare();
}
watch(() => route.fullPath, setFromRoute);
async function select() {
  selection.set([a.value, b.value].filter(Boolean));
  await router.replace({ path: '/compare', query: { ...(a.value ? { a: a.value } : {}), ...(b.value ? { b: b.value } : {}) } });
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
    <h1>Compare</h1>
    <p class="m-0 text-ink-2">Two verified identities. Source-listed notes and indicative traits, with uncertainty kept visible.</p>
    <section class="surface-solid sticky top-[var(--header-h)] z-20 flex min-w-0 flex-col gap-3 rounded-card p-3" aria-label="Comparison selectors">
      <label for="compare-search" class="text-sm font-semibold">Search your library</label>
      <input id="compare-search" v-model="q" type="search" class="tap min-w-0 rounded-control border border-line bg-sunken px-3" />
      <div class="grid min-w-0 grid-cols-2 gap-3">
        <div v-for="side in ['A', 'B']" :key="side" class="flex min-w-0 flex-col gap-1">
          <label :for="`scent-${side}`" class="font-semibold">Scent {{ side }}</label>
          <select :id="`scent-${side}`" :value="side === 'A' ? a : b" class="tap w-full min-w-0 rounded-control border border-line bg-sunken px-2" @change="change(side, $event)">
            <option value="">Choose a fragrance</option>
            <option v-for="f in options" :key="f.id" :value="f.id">{{ name(f) }}</option>
            <option v-if="(side === 'A' ? a : b) && !options.some(f => f.id === (side === 'A' ? a : b))" :value="side === 'A' ? a : b">Selected identity (see below)</option>
          </select>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="tap rounded-control border border-line px-3" @click="swap">Swap A / B</button>
        <button type="button" class="tap rounded-control border border-line px-3" @click="clear">Clear selection</button>
      </div>
    </section>
    <StatusBanner v-if="error" title="Select fragrances or retry" tone="warning">{{ error }} <button type="button" class="underline" @click="compare">Retry</button></StatusBanner>
    <p v-if="loading" role="status">Comparing stored source data…</p>
    <template v-if="data">
      <div class="flex flex-wrap gap-4">
        <label class="tap inline-flex items-center gap-2"><input v-model="expanded" type="checkbox" /> Full source-listed pyramid</label>
        <label class="tap inline-flex items-center gap-2"><input v-model="advanced" type="checkbox" /> Extended traits</label>
      </div>
      <div class="grid min-w-0 gap-5 xl:grid-cols-2">
        <article v-for="(f, i) in data.fragrances" :key="f.fragrance.id" class="flex min-w-0 flex-col gap-4" :aria-label="`Scent ${i === 0 ? 'A' : 'B'} profile`">
          <div class="surface-solid flex min-w-0 flex-col gap-2 rounded-card p-4">
            <svg viewBox="0 0 64 80" class="h-24 self-center text-ink-3" fill="none" stroke="currentColor" stroke-width="2" aria-label="Neutral bottle placeholder" role="img"><rect x="26" y="4" width="12" height="10" rx="2" /><rect x="12" y="20" width="40" height="54" rx="10" /></svg>
            <p class="m-0 text-sm text-ink-2">Scent {{ i === 0 ? 'A' : 'B' }} · {{ f.fragrance.brand }}</p>
            <h2 class="[overflow-wrap:anywhere]"><NuxtLink :to="`/fragrances/${f.fragrance.id}`">{{ f.fragrance.canonical_name }}</NuxtLink></h2>
            <p class="m-0 text-sm">{{ f.fragrance.concentration ? CONCENTRATION_LABEL[f.fragrance.concentration] : 'Concentration unknown' }}</p>
            <p class="m-0 text-sm">Your collection: {{ f.collection.map(c => c.state.replaceAll('_', ' ')).join(', ') || 'Not recorded' }}</p>
          </div>
          <FragranceNotePyramid :pyramid="f.pyramid" :compact="!expanded" :label="`Scent ${i === 0 ? 'A' : 'B'} pyramid`" />
          <div class="surface-solid rounded-card p-4">
            <h3>Family &amp; character</h3>
            <p>{{ f.fields.family?.value ?? 'Family not listed' }} · {{ f.fields.family?.origin ?? 'Unknown source' }}</p>
            <p class="[overflow-wrap:anywhere]">{{ f.fields.character?.value ?? 'Character not available.' }}</p>
            <h3>Which season or moment?</h3>
            <p v-if="f.personalSeasons.length">Your choices: {{ f.personalSeasons.map(s => `${s.season}: ${s.affinity}`).join(', ') }}</p>
            <p v-else>No personal seasonal preference recorded.</p>
            <p v-if="f.fields.wears">Provider editorial suggestion: {{ wearLabel(f.fields.wears.value) }}</p>
          </div>
          <FragranceSourceAttribution :fields="f.fields" />
        </article>
      </div>
      <FragranceScentTraitBars :rows="rows" :series="['Scent A', 'Scent B']" :method="data.method" />
      <details class="surface-solid rounded-card p-4"><summary class="tap cursor-pointer">How indicative traits are derived</summary>
        <p>{{ data.fragrances[0].limitation }} Each score is the maximum expression in the versioned rule table among matching source-listed notes.</p>
        <ul><li v-for="t in data.fragrances[0].traits.filter(t => t.score !== null)" :key="t.code">Scent A · {{ t.label }}: {{ t.evidence.map(e => `${e.label} (${e.expression})`).join(', ') }}</li><li v-for="t in data.fragrances[1].traits.filter(t => t.score !== null)" :key="`b-${t.code}`">Scent B · {{ t.label }}: {{ t.evidence.map(e => `${e.label} (${e.expression})`).join(', ') }}</li></ul>
      </details>
      <section class="surface-solid rounded-card p-4" aria-label="What differs?">
        <h2>What differs?</h2><p>{{ data.explanation.summary }}</p>
        <p>Listed only for A: {{ data.explanation.uniqueA.map(n => n.label).join(', ') || 'Not enough data' }}</p>
        <p>Listed only for B: {{ data.explanation.uniqueB.map(n => n.label).join(', ') || 'Not enough data' }}</p>
        <ul><li v-for="d in data.explanation.differences" :key="d.text">{{ d.text }}</li></ul>
        <p class="text-sm text-ink-2">{{ data.explanation.limitation }}</p>
      </section>
    </template>
    <EmptyState v-else-if="!loading && !error" icon="columns" title="Choose two fragrances" body="Search your saved library, then choose Scent A and Scent B. Add verified identities through Discover if needed." action-label="Find a fragrance" action-to="/discover" />
  </div>
</template>
