<script setup lang="ts">
// Field provenance (DESIGN §9.3): Scento / Official / Derived / Personal, with checked time.
import { sourceLabel, type EffectiveField } from '~~/shared/types';
defineProps<{ fields: Record<string, EffectiveField> }>();
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <details class="bay rounded-card p-4 md:p-5">
    <summary class="tap flex cursor-pointer items-center gap-2 font-medium"><AppIcon name="shield" :size="18" class="text-ink-3" /> Sources &amp; provenance</summary>
    <dl class="m-0 mt-3 grid gap-x-4 gap-y-2 text-[13px] text-ink-2 md:grid-cols-[max-content_1fr]">
      <template v-for="(f, name) in fields" :key="name">
        <dt class="etch self-center">{{ String(name).replace('_', ' ') }}</dt>
        <dd class="m-0 min-w-0">
          <span class="readout rounded-[4px] border border-line px-1.5 py-0.5 text-[11px] text-ink">{{ sourceLabel(f) }}</span>
          <template v-if="f.source">
            · <a v-if="f.source.url" :href="f.source.url" rel="noopener noreferrer" target="_blank" class="[overflow-wrap:anywhere]">{{ f.source.attribution ?? f.source.provider }}<span class="sr-only"> (opens in a new tab)</span></a>
            · checked {{ when(f.source.checkedAt) }}
          </template>
          <template v-else> · entered {{ when(f.claimedAt) }}</template>
        </dd>
      </template>
    </dl>
  </details>
</template>
