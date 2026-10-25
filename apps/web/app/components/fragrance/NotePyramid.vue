<script setup lang="ts">
// Top / Heart / Base (DESIGN §9.1). Solid surface; unknown tiers say "Not listed" —
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
  <section :aria-label="label" class="surface-solid rounded-card p-4 md:p-5">
    <div class="grid gap-4 md:grid-cols-3">
      <div v-for="t in tiers" :key="t.key" class="min-w-0">
        <h3 class="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-gold">{{ t.label }}</h3>
        <ul v-if="notes(t.key)" class="m-0 flex list-none flex-wrap gap-2 p-0" :aria-label="`${t.label} notes`">
          <li v-for="n in notes(t.key)" :key="n" class="rounded-control border border-line bg-sunken px-3 py-1 text-sm [overflow-wrap:anywhere]">{{ n }}</li>
        </ul>
        <p v-else class="m-0 text-sm text-ink-3" :data-testid="`tier-${t.key}-unknown`">Not listed</p>
      </div>
    </div>
    <p v-if="partial && pyramid" class="m-0 mt-3 text-xs text-ink-3">Partial source data: tiers without listed notes stay unknown.</p>
    <p v-if="!pyramid" class="m-0 mt-3 text-xs text-ink-3">No pyramid has been sourced or entered for this fragrance.</p>
  </section>
</template>
