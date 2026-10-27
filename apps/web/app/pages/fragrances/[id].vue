<script setup lang="ts">
// Fragrance detail (DESIGN §6.2): identity, note profile, character, provenance.
// Trait DNA, seasons and compare arrive in later phases and are not faked here.
import { CONCENTRATION_LABEL, isConfirmedIdentity, sourceLabel, type CollectionEntry, type EffectiveField, type Fragrance, type Pyramid, type Variant } from '~~/shared/types';
import type { DnaProfile } from '~~/shared/dna';

const route = useRoute();
const id = computed(() => String(route.params.id));
const data = ref<{ fragrance: Fragrance; fields: Record<string, EffectiveField>; primaryImageId?: string | null } | null>(null);
const primaryImage = ref<string | null>(null);
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
const removedNote = ref('');
async function onRemoved() {
  await loadRelationship();
  removedNote.value = 'Removed from your collection. The fragrance stays in your library.';
}
async function load() {
  error.value = null;
  try {
    data.value = await apiFetch(`/api/v1/fragrances/${id.value}/profile`);
    primaryImage.value = data.value?.primaryImageId ?? null;
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
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const listedNotes = computed(() => strings(data.value?.fields.listed_notes?.value));
const materials = computed(() => strings(data.value?.fields.signature_materials?.value));
const conc = computed(() => {
  const f = data.value?.fragrance;
  if (f?.concentration) return { label: CONCENTRATION_LABEL[f.concentration] ?? f.concentration, origin: null as string | null };
  const c = data.value?.fields.concentration;
  const v = c?.value as { raw?: string | null; normalized?: string | null } | undefined;
  if (c && (v?.normalized || v?.raw)) return { label: v.normalized ? (CONCENTRATION_LABEL[v.normalized] ?? v.normalized) : v.raw!, origin: sourceLabel(c) };
  return null;
});
const year = computed(() => {
  const f = data.value?.fragrance;
  if (f?.launch_year) return { label: String(f.launch_year), origin: null as string | null };
  const y = data.value?.fields.launch_year;
  return y && typeof y.value === 'number' ? { label: String(y.value), origin: sourceLabel(y) } : null;
});
const tierCount = computed(() => (['top', 'heart', 'base'] as const).reduce((n, k) => n + (pyramid.value?.[k]?.length ?? 0), 0));
const subfamily = computed(() => data.value?.fields.subfamily?.value as string | undefined);
</script>

<template>
  <div class="flex flex-col gap-5">
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
      <section class="bay overflow-hidden" aria-labelledby="frag-title">
        <div class="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-7">
          <div class="flex min-w-0 items-start gap-5">
          <div class="w-24 shrink-0 md:w-36"><FragranceImage :image-id="primaryImage" :alt="`${data.fragrance.brand} ${data.fragrance.canonical_name}`" size="hero" /></div>
          <div class="min-w-0">
            <h1 id="frag-title" class="text-[28px] md:text-[36px] [overflow-wrap:anywhere]">{{ data.fragrance.canonical_name }}</h1>
            <p class="m-0 mt-2 flex flex-wrap items-center gap-x-2 text-[15px] text-ink-2">
              <span class="text-ink">{{ data.fragrance.brand }}</span>
              <span aria-hidden="true" class="text-ink-3">/</span>
              <span>{{ conc ? conc.label : 'Concentration not recorded' }}<span v-if="conc?.origin" class="ml-1 text-[12px] text-ink-3">({{ conc.origin }})</span></span>
              <template v-if="year"><span aria-hidden="true" class="text-ink-3">/</span><span class="readout">{{ year.label }}</span><span v-if="year.origin" class="ml-1 text-[12px] text-ink-3">({{ year.origin }})</span></template>
            </p>
            <p v-if="data.fragrance.identity_status === 'owner_confirmed'" class="m-0 mt-3 text-[13px] text-ink-2">Confirmed by you from a shop page; Scento could not verify it. Facts below say where they come from.</p>
            <p v-else-if="data.fragrance.identity_status !== 'verified'" class="m-0 mt-3 text-[13px] text-warn">Unverified draft. Facts below are only what you entered.</p>
          </div>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-3 md:flex-col md:items-end">
            <FragranceIdentityMark :status="data.fragrance.identity_status" />
            <NuxtLink v-if="isConfirmedIdentity(data.fragrance.identity_status)" :to="`/compare?a=${data.fragrance.id}`" class="btn btn-quiet" @click="compareSelection.set([data.fragrance.id])">
              <AppIcon name="columns" :size="16" /> Compare with another fragrance
            </NuxtLink>
          </div>
        </div>
        <div class="border-t border-line bg-sunken/40 px-5 pb-5 pt-4 md:px-7 md:pb-7">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-[15px]">Note profile</h2>
            <AcademyExplainLink concept="pyramid" />
          </div>
          <FragranceChromatogram :pyramid="pyramid" label="Scent pyramid" />
          <FragranceListedNotes v-if="listedNotes.length && !tierCount" class="mt-5" :notes="listedNotes" :materials="materials" :source="data.fields.listed_notes ? sourceLabel(data.fields.listed_notes) : 'The source'" />
          <p class="m-0 mt-4 text-[12px] text-ink-3">
            <template v-if="!tierCount && listedNotes.length">No tiered pyramid is sourced, so the chromatogram stays flat.</template>
            <template v-else-if="!pyramid">No pyramid has been sourced or entered for this fragrance.</template>
            <template v-else>One peak per listed note. Height follows listed order, not concentration.<template v-if="data.fields.pyramid"> Source: {{ sourceLabel(data.fields.pyramid) }}.</template></template>
          </p>
        </div>
      </section>

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div class="flex min-w-0 flex-col gap-5">
          <GlassPanel variant="solid" as="section" class="flex flex-col gap-3 p-5" aria-labelledby="char-h">
            <div class="flex items-center justify-between gap-3">
              <h2 id="char-h">Character</h2>
              <AcademyExplainLink concept="family" />
            </div>
            <dl v-if="family" class="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[14px]">
              <dt class="etch self-center">Family</dt><dd class="m-0">{{ family }}<template v-if="subfamily"><span class="text-ink-3"> / </span>{{ subfamily }}</template></dd>
            </dl>
            <p v-if="character" class="m-0 max-w-[68ch] text-ink-2">{{ character }}</p>
            <p v-else class="m-0 text-ink-3">Not available.</p>
          </GlassPanel>
          <div v-if="dna" class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-3 px-1">
              <h2>Scent traits</h2>
              <AcademyExplainLink concept="traits" />
            </div>
            <FragranceScentTraitBars :rows="dna.traits.map(t => ({ code: t.code, label: t.label, values: [t.score] }))" :series="[data.fragrance.canonical_name]" :method="dna.method" />
          </div>
          <FragranceSourcesPanel :fragrance-id="data.fragrance.id" @saved="load" />
          <FragranceResearchPanel :fragrance-id="data.fragrance.id" @saved="load" />
          <CollectionVariantList :fragrance-id="data.fragrance.id" :variants="variants" @changed="loadRelationship" />
        </div>
        <div class="order-first flex min-w-0 flex-col gap-5 xl:order-none">
          <GlassPanel id="relationship" variant="solid" as="section" class="flex scroll-mt-24 flex-col gap-5 p-5" aria-labelledby="rel-h">
            <h2 id="rel-h">Your collection</h2>
            <p v-if="removedNote" role="status" class="m-0 text-[13px] text-ink-2">{{ removedNote }}</p>
            <p v-if="!entries.length" class="m-0 text-ink-2">Not in your collection yet.</p>
            <article v-for="(e, i) in entries" :key="e.id" class="flex flex-col gap-4 border-t border-line pt-4 first:border-0 first:pt-0" :aria-label="`Collection entry ${i + 1}`">
              <div class="flex flex-wrap items-center gap-3">
                <FragranceCollectionStatusBadge :state="e.state" />
                <span v-if="entries.length > 1" class="readout text-[12px] text-ink-3">Bottle {{ i + 1 }} of {{ entries.length }}</span>
              </div>
              <CollectionStatusPicker :entry="e" @updated="onUpdated" />
              <CollectionEntryEditor :entry="e" @updated="onUpdated" />
              <details v-if="e.history?.length">
                <summary class="tap flex cursor-pointer items-center text-[13px] font-medium">History ({{ e.history.length }})</summary>
                <div class="mt-2"><CollectionHistoryTimeline :events="e.history" /></div>
              </details>
              <CollectionRemoveEntry :entry="e" :name="data.fragrance.canonical_name" @removed="onRemoved" />
            </article>
            <div class="border-t border-line pt-4">
              <CollectionAddToCollection :fragrance-id="data.fragrance.id" :label="entries.length ? 'Add another bottle or sample as' : 'Add to collection as'" @added="onAdded" />
            </div>
          </GlassPanel>
          <FragranceImageManager :fragrance-id="data.fragrance.id" :name="data.fragrance.canonical_name" @changed="(p) => (primaryImage = p)" />
          <FragranceSourceAttribution v-if="Object.keys(data.fields).length" :fields="data.fields" />
          <FragranceLocalIndex v-if="isConfirmedIdentity(data.fragrance.identity_status)" :fragrance-id="data.fragrance.id" />
        </div>
      </div>
    </template>
    <div v-else class="bay h-72 animate-pulse" aria-busy="true" aria-label="Loading fragrance" />
  </div>
</template>
