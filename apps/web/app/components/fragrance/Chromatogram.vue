<script setup lang="ts">
// Note profile drawn as a chromatogram trace: three fixed zones (top, heart, base) on the
// tier luminance ramp, one labelled peak per listed note. Peak height encodes listed order within a tier, not concentration,
// and the caption says so. Unlisted tiers stay flat and are labelled "Not listed".
// Full mode plays "The Scan" once on mount: a read head sweeps the trace left to right.
// Reduced motion shows the finished trace immediately.
import { computed, onMounted, ref, useId } from 'vue';
import type { Pyramid } from '~~/shared/types';

const props = withDefaults(defineProps<{ pyramid: Pyramid | null | undefined; micro?: boolean; label?: string }>(), { micro: false, label: 'Note profile' });

const TIERS = [
  { key: 'top', label: 'Top' },
  { key: 'heart', label: 'Heart' },
  { key: 'base', label: 'Base' },
] as const;
type TierKey = (typeof TIERS)[number]['key'];

const W = computed(() => (props.micro ? 132 : 960));
const H = computed(() => (props.micro ? 30 : 200));
const PAD_TOP = computed(() => (props.micro ? 3 : 38));
const PAD_BOTTOM = computed(() => (props.micro ? 2 : 2));
const baseY = computed(() => H.value - PAD_BOTTOM.value);
const zoneW = computed(() => W.value / 3);

const list = (k: TierKey) => (props.pyramid?.[k] ?? []).filter((n) => typeof n === 'string' && n.trim());

interface Peak { tier: TierKey; name: string; x: number; h: number }
const peaks = computed<Peak[]>(() => {
  const out: Peak[] = [];
  TIERS.forEach((t, z) => {
    const notes = list(t.key);
    const n = notes.length;
    notes.forEach((name, i) => {
      const x = z * zoneW.value + ((i + 1) / (n + 1)) * zoneW.value;
      const h = Math.max(0.42, 1 - i * 0.11);
      out.push({ tier: t.key, name, x, h });
    });
  });
  return out;
});

// Sum of gaussians sampled across the width gives one continuous trace.
const trace = computed(() => {
  const samples = props.micro ? 90 : 320;
  const amp = baseY.value - PAD_TOP.value;
  const sigmaFor = (tier: TierKey) => {
    const n = Math.max(1, list(tier).length);
    return Math.min(zoneW.value / (n + 1) / 2.4, props.micro ? 4.2 : 26);
  };
  const pts: [number, number][] = [];
  for (let s = 0; s <= samples; s++) {
    const x = (s / samples) * W.value;
    let y = 0;
    for (const p of peaks.value) {
      const sg = sigmaFor(p.tier);
      y += p.h * Math.exp(-((x - p.x) ** 2) / (2 * sg * sg));
    }
    pts.push([x, baseY.value - Math.min(1, y) * amp]);
  }
  return pts;
});
const line = computed(() => trace.value.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '));
// Tier rules under the chart follow the spectral ramp (ADR-019): fresh top, mixed heart, warm base.
const TIER_RULE: Record<TierKey, string> = {
  top: 'var(--spectrum-fresh)',
  heart: 'color-mix(in oklab, var(--spectrum-fresh), var(--spectrum-warm))',
  base: 'var(--spectrum-warm)',
};
// Apex of the trace near each peak, for the label overlay (percent of the drawing box).
const labels = computed(() => {
  const amp = baseY.value - PAD_TOP.value;
  return peaks.value.map((p) => {
    const nearest = trace.value.reduce((best, pt) => (Math.abs(pt[0] - p.x) < Math.abs(best[0] - p.x) ? pt : best), trace.value[0]!);
    const n = list(p.tier).length;
    return { ...p, left: (p.x / W.value) * 100, top: (Math.min(nearest[1], baseY.value - amp * 0.2) / H.value) * 100, maxw: 100 / 3 / Math.max(1, n) };
  });
});
const area = computed(() => `${line.value} L${W.value} ${baseY.value} L0 ${baseY.value} Z`);

const counts = computed(() => TIERS.map((t) => ({ ...t, n: list(t.key).length })));
const summary = computed(() => {
  if (!props.pyramid || counts.value.every((c) => c.n === 0)) return `${props.label}: no notes listed`;
  return `${props.label}: ` + counts.value.map((c) => (c.n ? `${c.label} ${c.n} ${c.n === 1 ? 'note' : 'notes'}` : `${c.label} not listed`)).join(', ');
});
const empty = computed(() => counts.value.every((c) => c.n === 0));

const uid = useId();
const scanned = ref(props.micro);
onMounted(() => {
  if (props.micro) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  if (reduce) scanned.value = true;
  else requestAnimationFrame(() => requestAnimationFrame(() => (scanned.value = true)));
});
</script>

<template>
  <figure class="m-0 min-w-0" :class="micro ? '' : 'flex flex-col gap-3'">
    <div class="relative" :class="micro ? 'w-[132px]' : ''">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      :width="micro ? W : undefined"
      :height="micro ? H : undefined"
      preserveAspectRatio="none"
      role="img"
      :aria-label="summary"
      class="block overflow-visible"
      :class="micro ? 'h-[30px] w-[132px]' : 'h-[160px] w-full md:h-[200px]'"
    >
      <defs>
        <clipPath :id="`${uid}-reveal`">
          <rect x="0" y="0" :width="W" :height="H" class="chroma-reveal" :class="{ 'is-scanned': scanned }" />
        </clipPath>
        <!-- the spectral ramp (ADR-019): the trace dries down from fresh (top) to warm (base) -->
        <linearGradient :id="`${uid}-spectrum`" gradientUnits="userSpaceOnUse" x1="0" y1="0" :x2="W" y2="0" data-testid="chroma-spectrum">
          <stop offset="0" stop-color="var(--spectrum-fresh)" />
          <stop offset="1" stop-color="var(--spectrum-warm)" />
        </linearGradient>
        <linearGradient :id="`${uid}-fade`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="white" stop-opacity="1" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <mask :id="`${uid}-wash`" maskContentUnits="userSpaceOnUse">
          <rect x="0" :y="PAD_TOP" :width="W" :height="baseY - PAD_TOP" :fill="`url(#${uid}-fade)`" />
        </mask>
      </defs>

      <!-- zone separators and baseline -->
      <g stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke">
        <line :x1="zoneW" :x2="zoneW" :y1="micro ? 0 : 8" :y2="baseY" stroke-dasharray="2 3" />
        <line :x1="zoneW * 2" :x2="zoneW * 2" :y1="micro ? 0 : 8" :y2="baseY" stroke-dasharray="2 3" />
        <line x1="0" :x2="W" :y1="baseY" :y2="baseY" stroke="var(--line-strong)" />
      </g>
      <g v-if="!micro" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="1 5">
        <line x1="0" :x2="W" :y1="PAD_TOP + (baseY - PAD_TOP) * 0.33" :y2="PAD_TOP + (baseY - PAD_TOP) * 0.33" />
        <line x1="0" :x2="W" :y1="PAD_TOP + (baseY - PAD_TOP) * 0.66" :y2="PAD_TOP + (baseY - PAD_TOP) * 0.66" />
      </g>

      <g v-if="!empty" :clip-path="`url(#${uid}-reveal)`">
        <path :d="area" :fill="`url(#${uid}-spectrum)`" :fill-opacity="micro ? 0.22 : 0.2" :mask="`url(#${uid}-wash)`" />
        <path
          :d="line"
          fill="none"
          :stroke="`url(#${uid}-spectrum)`"
          :stroke-width="micro ? 1.25 : 1.6"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
          data-testid="chroma-trace"
        />
        <template v-if="!micro">
          <line
            v-for="p in peaks"
            :key="`${p.tier}-${p.name}`"
            :x1="p.x" :x2="p.x" :y1="baseY" :y2="baseY - 6"
            stroke="var(--ink-3)" stroke-width="1" vector-effect="non-scaling-stroke"
          />
        </template>
      </g>
      <line
        v-if="!micro"
        class="chroma-head"
        :class="{ 'is-scanned': scanned }"
        x1="0" x2="0" y1="0" :y2="baseY"
        stroke="var(--signal)" stroke-width="1.5" vector-effect="non-scaling-stroke"
        aria-hidden="true"
      />
    </svg>
    <div v-if="!micro && !empty" class="chroma-labels pointer-events-none absolute inset-0 hidden md:block" :class="{ 'is-scanned': scanned }" aria-hidden="true">
      <span
        v-for="l in labels"
        :key="`${l.tier}-${l.name}`"
        class="readout absolute -translate-x-1/2 -translate-y-full truncate whitespace-nowrap pb-1.5 text-center text-[11px] text-ink-2"
        :style="{ left: `${l.left}%`, top: `${l.top}%`, maxWidth: `${l.maxw}%` }"
        :title="l.name"
      >{{ l.name }}</span>
    </div>
    </div>

    <figcaption v-if="!micro" class="grid grid-cols-3 gap-4">
      <div v-for="c in counts" :key="c.key" class="min-w-0 border-t-2 pt-2.5" :style="{ borderTopColor: TIER_RULE[c.key] }">
        <p class="etch m-0 flex items-baseline justify-between">
          <span>{{ c.label }}</span>
          <span class="readout normal-case tracking-normal">{{ c.n ? String(c.n).padStart(2, '0') : '--' }}</span>
        </p>
        <ul v-if="c.n" class="m-0 mt-2 flex list-none flex-col gap-0.5 p-0 text-[13px] text-ink-2" :aria-label="`${c.label} notes`">
          <li v-for="n in list(c.key)" :key="n" class="[overflow-wrap:anywhere]">{{ n }}</li>
        </ul>
        <p v-else class="m-0 mt-2 text-[13px] text-ink-3" :data-testid="`tier-${c.key}-unknown`">Not listed</p>
      </div>
    </figcaption>
  </figure>
</template>

<style scoped>
.chroma-reveal {
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 1100ms cubic-bezier(0.65, 0, 0.35, 1);
}
.chroma-reveal.is-scanned { transform: scaleX(1); }
.chroma-head {
  transform: translateX(0);
  transform-box: view-box;
  opacity: 1;
  transition: transform 1100ms cubic-bezier(0.65, 0, 0.35, 1), opacity 260ms ease 1100ms;
}
.chroma-head.is-scanned { transform: translateX(100%); opacity: 0; }
.chroma-labels { opacity: 0; transition: opacity 400ms ease 900ms; }
.chroma-labels.is-scanned { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .chroma-reveal, .chroma-head, .chroma-labels { transition: none; }
}
</style>
