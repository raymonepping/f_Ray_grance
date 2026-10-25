<script setup lang="ts">
// Top / Heart / Base (DESIGN §9.1). Unknown tiers say "Not listed",
// never a guessed note. `compact` shows the first listed note per tier only.
import { computed } from 'vue';
import type { Pyramid } from '~~/shared/types';
const props = withDefaults(defineProps<{ pyramid: Pyramid | null; compact?: boolean; label?: string }>(), { compact: false, label: 'Scent pyramid' });
const tiers = [
  { key: 'top', label: 'Top' },
  { key: 'heart', label: 'Heart' },
  { key: 'base', label: 'Base' },
] as const;
const notes = (k: (typeof tiers)[number]['key']) => {
  const list = props.pyramid?.[k] ?? null;
  if (!list || list.length === 0) return null;
  return props.compact ? list.slice(0, 1) : list;
};
const partial = computed(() => tiers.some((t) => !props.pyramid?.[t.key]?.length));
</script>

<template>
  <section :aria-label="label">
    <div class="grid grid-cols-3 gap-4">
      <div v-for="t in tiers" :key="t.key" class="min-w-0 border-t border-line pt-2.5">
        <h3 class="etch m-0 font-normal">{{ t.label }}</h3>
        <ul v-if="notes(t.key)" class="m-0 mt-2 flex list-none flex-col gap-0.5 p-0 text-[14px]" :aria-label="`${t.label} notes`">
          <li v-for="n in notes(t.key)" :key="n" class="[overflow-wrap:anywhere]">{{ n }}</li>
        </ul>
        <p v-else class="m-0 mt-2 text-[13px] text-ink-3" :data-testid="`tier-${t.key}-unknown`">Not listed</p>
      </div>
    </div>
    <p v-if="partial && pyramid" class="m-0 mt-3 text-[12px] text-ink-3">Partial source data: tiers without listed notes stay unknown.</p>
    <p v-if="!pyramid" class="m-0 mt-3 text-[12px] text-ink-3">No pyramid has been sourced or entered for this fragrance.</p>
    <p v-else-if="compact" class="m-0 mt-3 text-[12px] text-ink-3">First listed note per tier. Turn on the full pyramid to see every note.</p>
  </section>
</template>
