<script setup lang="ts">
// Field provenance (DESIGN §9.3): Scento / Official / Derived / Personal, with checked time.
import { ORIGIN_LABEL, type EffectiveField } from '~~/shared/types';
defineProps<{ fields: Record<string, EffectiveField> }>();
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <details class="surface-solid rounded-card p-4 md:p-5">
    <summary class="tap flex cursor-pointer items-center gap-2 font-semibold"><AppIcon name="info" /> Sources &amp; provenance</summary>
    <dl class="m-0 mt-3 grid gap-x-4 gap-y-2 text-sm md:grid-cols-[max-content_1fr]">
      <template v-for="(f, name) in fields" :key="name">
        <dt class="font-semibold capitalize text-ink-2">{{ String(name).replace('_', ' ') }}</dt>
        <dd class="m-0 min-w-0">
          <span class="rounded border border-line px-1.5 py-0.5 text-xs">{{ ORIGIN_LABEL[f.origin] }}</span>
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
