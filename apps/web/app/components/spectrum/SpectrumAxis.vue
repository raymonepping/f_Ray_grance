<script setup lang="ts">
// One bipolar spectrum (-1 left pole .. +1 right pole) as an instrument track: graduations, the
// spread of placed fragrances, one linked tick per fragrance (grouped when positions coincide) and the
// collection marker. Values are also written out in the list below, the accessible alternative, so
// nothing depends on colour or on reading the track.
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

// Plotted ticks are real controls. Fragrances closer together than one 24 px target share a group:
// one tick opens its detail directly, a group opens a short list, so no fragrance is unreachable.
const track = ref<HTMLElement | null>(null);
const width = ref(640);
let ro: ResizeObserver | null = null;
onMounted(() => {
  if (!track.value) return;
  width.value = track.value.clientWidth || width.value;
  ro = new ResizeObserver(([e]) => (width.value = e?.contentRect.width || width.value));
  ro.observe(track.value);
});
onBeforeUnmount(() => ro?.disconnect());
type Tick = AxisData['fragrances'][number];
const groups = computed(() => {
  const near = (24 / Math.max(width.value, 1)) * 2; // 24 px in position units (-1..+1)
  const out: { key: string; position: number; items: Tick[] }[] = [];
  for (const f of sorted.value) {
    const last = out[out.length - 1];
    if (last && f.position - last.items[last.items.length - 1]!.position < near) last.items.push(f);
    else out.push({ key: f.id, position: f.position, items: [f] });
  }
  for (const g of out) g.position = g.items.reduce((a, f) => a + f.position, 0) / g.items.length;
  return out;
});
const open = ref<string | null>(null);
const tickLabel = (f: Tick) => `${f.name}, ${f.brand}: ${reading(f.position)}, ${fmt(f.position)}. Open details`;
const groupLabel = (g: { items: Tick[] }) => `${g.items.length} fragrances close together near ${fmt(g.items[0]!.position)}: ${g.items.map((f) => f.name).join(', ')}`;
// Spectral colour (ADR-019): Fresh ↔ Warm runs lime to orange; Dry ↔ Sweet stays neutral, warming
// toward Sweet. Colour follows position only; every value is also written out below.
const fresh = 'var(--spectrum-fresh)';
const warm = 'var(--spectrum-warm)';
const isFreshWarm = computed(() => props.axis.code === 'fresh_warm');
const leftEnd = computed(() => (isFreshWarm.value ? fresh : 'var(--ink-3)'));
const tickColour = (p: number) => `color-mix(in oklab, ${warm} ${Math.round(((p + 1) / 2) * 100)}%, ${leftEnd.value})`;
const trackTint = computed(
  () =>
    `linear-gradient(90deg, color-mix(in srgb, ${isFreshWarm.value ? fresh : 'var(--ink-3)'} ${isFreshWarm.value ? 16 : 0}%, transparent), color-mix(in srgb, ${warm} ${isFreshWarm.value ? 18 : 12}%, transparent))`,
);
const align = (p: number) => (p < -0.33 ? 'left-0' : p > 0.33 ? 'right-0' : 'left-1/2 -translate-x-1/2');
function closeGroup(e: KeyboardEvent, key: string) {
  if (e.key !== 'Escape' || open.value !== key) return;
  open.value = null;
  (document.getElementById(`tick-${props.axis.code}-${key}`) as HTMLButtonElement | null)?.focus();
}
function onDocClick(e: MouseEvent) {
  if (open.value && track.value && !track.value.contains(e.target as Node)) open.value = null;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <section class="bay flex flex-col gap-5 p-5 md:p-6" :aria-labelledby="`axis-${axis.code}`" :data-testid="`axis-${axis.code}`">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 :id="`axis-${axis.code}`">{{ axis.label }}</h2>
        <p class="m-0 mt-1 text-[14px] text-ink-2" data-testid="axis-reading">
          {{ reading(axis.position) }}<span v-if="axis.position !== null" class="readout ml-2 text-ink">{{ fmt(axis.position) }}</span><span v-if="axis.placed === 1" class="ml-2 text-ink-3">· based on one fragrance</span>
        </p>
      </div>
      <p class="readout m-0 text-[12px] text-ink-3" data-testid="axis-coverage">{{ axis.placed }}/{{ axis.total }} placed</p>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex justify-between text-[13px]" aria-hidden="true">
        <span class="font-medium" :class="isFreshWarm ? 'text-spectrum-fresh-text' : ''">{{ axis.left.label }}</span>
        <span class="text-ink-3">balanced</span>
        <span class="font-medium text-spectrum-warm-text">{{ axis.right.label }}</span>
      </div>
      <div ref="track" class="relative h-16 rounded-control border border-line bg-sunken" :style="{ backgroundImage: trackTint }" data-testid="axis-track">
        <div class="absolute inset-0" aria-hidden="true">
          <!-- graduations every 0.25 -->
          <span v-for="g in 9" :key="g" class="absolute bottom-0 w-px" :class="g === 5 ? 'top-0 bg-line-strong' : 'h-2 bg-line-strong'" :style="{ left: `${((g - 1) / 8) * 100}%` }" />
          <!-- spread band -->
          <span
            v-if="axis.spread"
            class="absolute inset-y-3 rounded-[3px] bg-raised shadow-[inset_0_0_0_1px_var(--line-strong)]"
            :style="{ left: pct(axis.spread.min), width: `calc(${pct(axis.spread.max)} - ${pct(axis.spread.min)} + 2px)` }"
          />
          <!-- collection marker -->
          <template v-if="axis.position !== null">
            <span class="absolute inset-y-1 w-[2px] -translate-x-1/2 bg-ink" :style="{ left: pct(axis.position) }" />
            <span class="absolute -top-[7px] size-0 -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-ink" :style="{ left: pct(axis.position) }" />
          </template>
        </div>
        <!-- one operable tick per fragrance (or per group of coinciding fragrances) -->
        <ul class="absolute inset-0 m-0 list-none p-0" :aria-label="`${axis.label}: plotted fragrances`" data-testid="axis-ticks">
          <li v-for="g in groups" :key="g.key" class="absolute inset-y-0 -translate-x-1/2" :style="{ left: pct(g.position) }">
            <NuxtLink
              v-if="g.items.length === 1"
              :to="`/fragrances/${g.items[0]!.id}`"
              class="motion group flex h-full w-6 justify-center rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-1"
              :aria-label="tickLabel(g.items[0]!)"
              :title="`${g.items[0]!.name} ${fmt(g.items[0]!.position)}`"
            >
              <span class="my-4 w-[2px] rounded-full group-hover:w-[3px]" :style="{ backgroundColor: tickColour(g.items[0]!.position) }" aria-hidden="true" />
            </NuxtLink>
            <template v-else>
              <button
                :id="`tick-${axis.code}-${g.key}`"
                type="button"
                class="motion group flex h-full w-6 flex-col items-center justify-center rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-1"
                :aria-label="groupLabel(g)"
                :aria-expanded="open === g.key"
                :aria-controls="`ticks-${axis.code}-${g.key}`"
                @click.stop="open = open === g.key ? null : g.key"
                @keydown="closeGroup($event, g.key)"
              >
                <span class="w-[2px] flex-1 rounded-full group-hover:w-[3px]" :style="{ marginBlock: '10px 2px', backgroundColor: tickColour(g.position) }" aria-hidden="true" />
                <span class="readout mb-1 text-[11px] leading-none text-ink-2" aria-hidden="true">{{ g.items.length }}</span>
              </button>
              <ul
                v-if="open === g.key"
                :id="`ticks-${axis.code}-${g.key}`"
                class="bay absolute top-full z-10 m-0 mt-2 w-max max-w-[min(16rem,70vw)] list-none p-1 shadow-lg"
                :class="align(g.position)"
                :aria-label="`Fragrances near ${fmt(g.items[0]!.position)}`"
                @keydown="closeGroup($event, g.key)"
              >
                <li v-for="f in g.items" :key="f.id">
                  <NuxtLink :to="`/fragrances/${f.id}`" class="flex min-h-10 items-center justify-between gap-3 rounded-[6px] px-3 text-[14px] no-underline hover:bg-raised">
                    <span class="min-w-0 truncate">{{ f.name }} <span class="text-ink-3">{{ f.brand }}</span></span>
                    <span class="readout shrink-0 text-[13px]">{{ fmt(f.position) }}</span>
                  </NuxtLink>
                </li>
              </ul>
            </template>
          </li>
        </ul>
      </div>
      <div class="readout flex justify-between text-[11px] text-ink-3" aria-hidden="true"><span>−1</span><span>0</span><span>+1</span></div>
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
