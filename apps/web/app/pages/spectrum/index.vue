<script setup lang="ts">
// My Spectrum (Phase 13, spec/SPECTRUM_SPEC.md): where the fragrances you own sit on two scent
// spectrums. It describes the collection, never what you like; unknown traits stay unknown.
import type { AxisData } from '~~/shared/spectrum';

usePageHeader({ title: 'My Spectrum' });
useHead({ title: 'My Spectrum · F-Ray-grance' });
interface Spectrum {
  scope: 'owned' | 'owned_and_samples';
  method: string;
  traitMethod: string;
  total: number;
  axes: AxisData[];
  traits: { code: string; label: string; mean: number | null; known: number; total: number }[];
  families: { family: string; count: number }[];
  unknownFamily: number;
  limitation: string;
}
const scope = ref<'owned' | 'owned_and_samples'>('owned');
const data = ref<Spectrum | null>(null);
const error = ref('');
// Only the latest request may update the page: a slower response for a scope the owner has already
// left (or one arriving after navigation) is discarded, and its request is aborted.
let generation = 0;
let inflight: AbortController | null = null;
async function load() {
  const mine = ++generation;
  inflight?.abort();
  const ctrl = (inflight = new AbortController());
  const want = scope.value;
  error.value = '';
  data.value = null; // the loading state, never counts from the previous scope
  try {
    const got = await apiFetch<Spectrum>(`/api/v1/profile/spectrum?scope=${want}`, { signal: ctrl.signal });
    if (mine === generation && got.scope === want) data.value = got;
  } catch (e) {
    if (mine === generation && !ctrl.signal.aborted) error.value = e instanceof ApiFailure ? e.message : 'Spectrum unavailable';
  }
}
watch(scope, load, { immediate: true });
onBeforeUnmount(() => {
  generation++;
  inflight?.abort();
});
const pad = (n: number) => String(n).padStart(2, '0');
const maxFamily = computed(() => Math.max(1, ...(data.value?.families.map((f) => f.count) ?? [1])));
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1>My Spectrum</h1>
        <p class="m-0 mt-2 max-w-[62ch] text-[15px] text-ink-2">Where the fragrances you own sit on two scent spectrums. A description of your collection, not of what you like.</p>
      </div>
      <dl v-if="data && data.total" class="readout m-0 flex gap-6 text-right" aria-label="Spectrum readout">
        <div><dt class="etch">In view</dt><dd class="m-0 mt-1 text-[22px] leading-none">{{ pad(data.total) }}</dd></div>
        <div><dt class="etch">Families</dt><dd class="m-0 mt-1 text-[22px] leading-none">{{ pad(data.families.length) }}</dd></div>
      </dl>
    </div>

    <div class="flex w-fit max-w-full flex-wrap gap-1 rounded-control border border-line bg-sunken p-1" role="group" aria-label="Which fragrances">
      <button
        v-for="o in [{ k: 'owned', l: 'Owned' }, { k: 'owned_and_samples', l: 'Owned and samples' }] as const"
        :key="o.k"
        type="button"
        class="motion flex h-9 items-center rounded-[6px] px-3 text-[14px] pointer-coarse:h-11"
        :class="scope === o.k ? 'bg-raised font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink'"
        :aria-pressed="scope === o.k"
        @click="scope = o.k"
      >{{ o.l }}</button>
    </div>

    <StatusBanner v-if="error" tone="error" title="Spectrum unavailable">{{ error }} <button type="button" class="underline" @click="load">Retry</button></StatusBanner>
    <div v-else-if="!data" class="bay h-64 animate-pulse" aria-busy="true" aria-label="Loading spectrum" />
    <EmptyState
      v-else-if="!data.total"
      icon="library"
      :title="scope === 'owned' ? 'No owned fragrances yet' : 'No owned fragrances or samples yet'"
      body="Mark fragrances as owned in your collection, and your spectrum appears here."
      action-label="Go to Collection"
      action-to="/collection"
    />
    <template v-else>
      <SpectrumAxis v-for="a in data.axes" :key="a.code" :axis="a" />

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div class="flex flex-col gap-2">
          <h2 class="px-1">Trait readout</h2>
          <FragranceScentTraitBars :rows="data.traits.map((t) => ({ code: t.code, label: `${t.label} (${t.known}/${t.total})`, values: [t.mean] }))" :series="['Collection mean']" :method="data.traitMethod" />
        </div>
        <section class="bay flex h-fit flex-col gap-3 p-5" aria-labelledby="families-h">
          <h2 id="families-h">Families</h2>
          <ul v-if="data.families.length" class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Families in view">
            <li v-for="f in data.families" :key="f.family" class="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 text-[14px]">
              <span class="min-w-0">
                <span class="block truncate">{{ f.family }}</span>
                <span class="mt-1 block h-[6px] rounded-[2px] bg-sunken" aria-hidden="true"><span class="block h-full rounded-[2px] bg-ink" :style="{ width: `${(f.count / maxFamily) * 100}%` }" /></span>
              </span>
              <span class="readout text-right">{{ f.count }}</span>
            </li>
          </ul>
          <p v-if="data.unknownFamily" class="m-0 text-[13px] text-ink-3">Family not listed: <span class="readout">{{ data.unknownFamily }}</span></p>
        </section>
      </div>
      <p class="m-0 text-[12px] text-ink-3">{{ data.limitation }} Method <span class="readout">{{ data.method }}</span> over traits <span class="readout">{{ data.traitMethod }}</span>.</p>
    </template>
  </div>
</template>
