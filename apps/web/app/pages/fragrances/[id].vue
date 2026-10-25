<script setup lang="ts">
// Fragrance detail (DESIGN §6.2): identity → pyramid → character → provenance.
// Trait DNA, seasons and compare arrive in later phases and are not faked here.
import { CONCENTRATION_LABEL, type CollectionEntry, type EffectiveField, type Fragrance, type Pyramid, type Variant } from '~~/shared/types';
import type { DnaProfile } from '~~/shared/dna';

const route = useRoute();
const id = computed(() => String(route.params.id));
const data = ref<{ fragrance: Fragrance; fields: Record<string, EffectiveField> } | null>(null);
const error = ref<{ code: string; message: string } | null>(null);
const header = usePageHeader({ title: 'Fragrance', crumbs: [{ label: 'Collection', to: '/collection' }, { label: 'Fragrance' }] });
const entries = ref<CollectionEntry[]>([]);
const variants = ref<Variant[]>([]);
const dna = ref<DnaProfile | null>(null);
const compareSelection = useCompare();
async function loadRelationship() {
  const r = await apiFetch<{ entries: CollectionEntry[]; variants: Variant[] }>(`/api/v1/fragrances/${id.value}/relationship`);
  entries.value = r.entries;
  variants.value = r.variants;
}
function onUpdated(e: CollectionEntry) {
  entries.value = entries.value.map((x) => (x.id === e.id ? e : x));
}
async function onAdded() {
  await loadRelationship();
}
async function load() {
  error.value = null;
  try {
    data.value = await apiFetch(`/api/v1/fragrances/${id.value}/profile`);
    dna.value = await apiFetch(`/api/v1/fragrances/${id.value}/dna`);
    await loadRelationship();
    const f = data.value!.fragrance;
    usePageHeader({
      title: f.canonical_name,
      crumbs: [{ label: 'Collection', to: '/collection' }, { label: f.brand }, { label: f.canonical_name }],
      action: { label: entries.value.length ? 'Edit collection status' : 'Add to collection', to: '#relationship' },
    });
  } catch (e) {
    error.value = e instanceof ApiFailure ? { code: e.code, message: e.message } : { code: 'INTERNAL', message: 'Could not load' };
  }
}
watch(id, load, { immediate: true });
void header;
const pyramid = computed(() => (data.value?.fields.pyramid?.value as Pyramid | undefined) ?? null);
const character = computed(() => data.value?.fields.character?.value as string | undefined);
const family = computed(() => data.value?.fields.family?.value as string | undefined);
const subfamily = computed(() => data.value?.fields.subfamily?.value as string | undefined);
</script>

<template>
  <div class="flex flex-col gap-6">
    <EmptyState
      v-if="error?.code === 'NOT_FOUND' || error?.code === 'VALIDATION_FAILED'"
      icon="search"
      title="Fragrance not found"
      body="This link does not match a fragrance in your library. Search for it instead."
      action-label="Search fragrances"
      action-to="/discover"
    />
    <StatusBanner v-else-if="error" tone="error" title="Could not load this fragrance">{{ error.message }} <button type="button" class="underline" @click="load">Retry</button></StatusBanner>
    <template v-else-if="data">
      <GlassPanel variant="solid" class="flex flex-col gap-2 p-5 md:p-6">
        <p class="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{{ data.fragrance.brand }}</p>
        <h1 class="[overflow-wrap:anywhere]">{{ data.fragrance.canonical_name }}</h1>
        <p class="m-0 text-ink-2">
          {{ data.fragrance.concentration ? CONCENTRATION_LABEL[data.fragrance.concentration] : 'Concentration not recorded' }}
          <template v-if="data.fragrance.launch_year"> · {{ data.fragrance.launch_year }}</template>
        </p>
        <p v-if="data.fragrance.identity_status !== 'verified'" class="m-0 text-sm text-warn">Unverified draft — facts below are only what you entered.</p>
        <NuxtLink v-else :to="`/compare?a=${data.fragrance.id}`" class="tap inline-flex w-fit items-center" @click="compareSelection.set([data.fragrance.id])">Compare with another fragrance</NuxtLink>
      </GlassPanel>
      <GlassPanel id="relationship" variant="solid" as="section" class="flex scroll-mt-24 flex-col gap-5 p-5" aria-labelledby="rel-h">
        <h2 id="rel-h">Your collection</h2>
        <p v-if="!entries.length" class="m-0 text-ink-2">Not in your collection yet.</p>
        <article v-for="(e, i) in entries" :key="e.id" class="flex flex-col gap-4 border-t border-line pt-4 first:border-0 first:pt-0" :aria-label="`Collection entry ${i + 1}`">
          <div class="flex flex-wrap items-center gap-2">
            <FragranceCollectionStatusBadge :state="e.state" />
            <span v-if="entries.length > 1" class="text-xs text-ink-3">Bottle {{ i + 1 }} of {{ entries.length }}</span>
          </div>
          <CollectionStatusPicker :entry="e" @updated="onUpdated" />
          <CollectionEntryEditor :entry="e" @updated="onUpdated" />
          <details v-if="e.history?.length">
            <summary class="tap flex cursor-pointer items-center text-sm font-semibold">History ({{ e.history.length }})</summary>
            <div class="mt-2"><CollectionHistoryTimeline :events="e.history" /></div>
          </details>
        </article>
        <div class="border-t border-line pt-4">
          <CollectionAddToCollection :fragrance-id="data.fragrance.id" :label="entries.length ? 'Add another bottle or sample as' : 'Add to collection as'" @added="onAdded" />
        </div>
      </GlassPanel>
      <div>
        <h2 class="mb-3">Scent pyramid</h2>
        <FragranceNotePyramid :pyramid="pyramid" />
      </div>
      <GlassPanel variant="solid" class="flex flex-col gap-2 p-5">
        <h2>Character</h2>
        <p v-if="family" class="m-0 text-ink-2">Family: {{ family }}<template v-if="subfamily"> / {{ subfamily }}</template></p>
        <p v-if="character" class="m-0">{{ character }}</p>
        <p v-else class="m-0 text-ink-3">Not available.</p>
      </GlassPanel>
      <FragranceSourceAttribution v-if="Object.keys(data.fields).length" :fields="data.fields" />
      <FragranceScentTraitBars v-if="dna" :rows="dna.traits.map(t => ({ code: t.code, label: t.label, values: [t.score] }))" :series="[data.fragrance.canonical_name]" :method="dna.method" />
      <CollectionVariantList :fragrance-id="data.fragrance.id" :variants="variants" @changed="loadRelationship" />
      <FragranceLocalIndex v-if="data.fragrance.identity_status === 'verified'" :fragrance-id="data.fragrance.id" />
    </template>
    <div v-else class="surface-solid h-64 rounded-card opacity-60" aria-busy="true" aria-label="Loading fragrance" />
  </div>
</template>
