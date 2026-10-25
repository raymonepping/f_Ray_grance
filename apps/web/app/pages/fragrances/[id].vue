<script setup lang="ts">
// Fragrance detail (DESIGN §6.2): identity → pyramid → character → provenance.
// Trait DNA, seasons and compare arrive in later phases and are not faked here.
import { CONCENTRATION_LABEL, type EffectiveField, type Fragrance, type Pyramid } from '~~/shared/types';

const route = useRoute();
const id = computed(() => String(route.params.id));
const data = ref<{ fragrance: Fragrance; fields: Record<string, EffectiveField> } | null>(null);
const error = ref<{ code: string; message: string } | null>(null);
const header = usePageHeader({ title: 'Fragrance', crumbs: [{ label: 'Collection', to: '/collection' }, { label: 'Fragrance' }] });
async function load() {
  error.value = null;
  try {
    data.value = await apiFetch(`/api/v1/fragrances/${id.value}/profile`);
    const f = data.value!.fragrance;
    usePageHeader({ title: f.canonical_name, crumbs: [{ label: 'Collection', to: '/collection' }, { label: f.brand }, { label: f.canonical_name }] });
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
    </template>
    <div v-else class="surface-solid h-64 rounded-card opacity-60" aria-busy="true" aria-label="Loading fragrance" />
  </div>
</template>
