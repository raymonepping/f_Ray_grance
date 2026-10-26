<script setup lang="ts">
// One bipolar spectrum (-1 left pole .. +1 right pole) as an instrument track: graduations, the
// spread of placed fragrances, one linked tick per fragrance and the collection marker. Values are
// also written out in the list below, so nothing depends on colour or on reading the track.
import type { AxisData } from '~~/shared/spectrum';
const props = defineProps<{ axis: AxisData }>();

const pct = (p: number) => `${((p + 1) / 2) * 100}%`;
const fmt = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p).toFixed(2)}`;
function reading(p: number | null): string {
  if (p === null) return 'Not enough known traits to place your collection';
  const a = Math.abs(p);
  const side = p < 0 ? props.axis.left.label : props.axis.right.label;
  if (a < 0.08) return 'Balanced between the two';
  return a < 0.3 ? `Leans ${side}` : `Clearly ${side}`;
}
const sorted = computed(() => [...props.axis.fragrances].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)));
const traitList = (t: string[]) => t.map((x) => x.replace('_', '/')).join(', ');
</script>

<template>
  <section class="bay flex flex-col gap-5 p-5 md:p-6" :aria-labelledby="`axis-${axis.code}`" :data-testid="`axis-${axis.code}`">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 :id="`axis-${axis.code}`">{{ axis.label }}</h2>
        <p class="m-0 mt-1 text-[14px] text-ink-2" data-testid="axis-reading">
          {{ reading(axis.position) }}<span v-if="axis.position !== null" class="readout ml-2 text-ink">{{ fmt(axis.position) }}</span>
        </p>
      </div>
      <p class="readout m-0 text-[12px] text-ink-3" data-testid="axis-coverage">{{ axis.placed }}/{{ axis.total }} placed</p>
    </div>

    <div class="flex flex-col gap-2" aria-hidden="true">
      <div class="flex justify-between text-[13px]">
        <span class="font-medium">{{ axis.left.label }}</span>
        <span class="text-ink-3">balanced</span>
        <span class="font-medium">{{ axis.right.label }}</span>
      </div>
      <div class="relative h-16 rounded-control border border-line bg-sunken">
        <!-- graduations every 0.25 -->
        <span v-for="g in 9" :key="g" class="absolute bottom-0 w-px" :class="g === 5 ? 'top-0 bg-line-strong' : 'h-2 bg-line-strong'" :style="{ left: `${((g - 1) / 8) * 100}%` }" />
        <!-- spread band -->
        <span
          v-if="axis.spread"
          class="absolute inset-y-3 rounded-[3px] bg-raised shadow-[inset_0_0_0_1px_var(--line-strong)]"
          :style="{ left: pct(axis.spread.min), width: `calc(${pct(axis.spread.max)} - ${pct(axis.spread.min)} + 2px)` }"
        />
        <!-- one tick per fragrance -->
        <span v-for="f in axis.fragrances" :key="f.id" class="absolute inset-y-4 w-[2px] -translate-x-1/2 rounded-full bg-ink-2" :style="{ left: pct(f.position) }" />
        <!-- collection marker -->
        <template v-if="axis.position !== null">
          <span class="absolute inset-y-1 w-[2px] -translate-x-1/2 bg-ink" :style="{ left: pct(axis.position) }" />
          <span class="absolute -top-[7px] size-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-ink" :style="{ left: pct(axis.position) }" />
        </template>
      </div>
      <div class="readout flex justify-between text-[11px] text-ink-3"><span>−1</span><span>0</span><span>+1</span></div>
    </div>

    <ul v-if="sorted.length" class="m-0 list-none overflow-hidden rounded-control border border-line p-0" :aria-label="`${axis.label}: your fragrances`">
      <li v-for="f in sorted" :key="f.id" class="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0">
        <NuxtLink :to="`/fragrances/${f.id}`" class="min-w-0 truncate text-[14px] no-underline hover:underline">{{ f.name }} <span class="text-ink-3">{{ f.brand }}</span></NuxtLink>
        <span class="readout shrink-0 text-[13px]" :aria-label="`${reading(f.position)}, ${fmt(f.position)}`">{{ fmt(f.position) }}</span>
      </li>
    </ul>
    <p class="m-0 text-[12px] text-ink-3">
      {{ axis.left.label }}: {{ traitList(axis.left.traits) }}. {{ axis.right.label }}: {{ traitList(axis.right.traits) }}.
      <template v-if="axis.notPlaced.length"> Not placed (no known traits on one side): {{ axis.notPlaced.map((f) => f.name).join(', ') }}.</template>
    </p>
  </section>
</template>
