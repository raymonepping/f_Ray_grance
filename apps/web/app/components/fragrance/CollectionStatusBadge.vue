<script setup lang="ts">
// Status as a glyph plus label (never colour alone). Lime is reserved for verified identity,
// so statuses use ink weight: filled for owned, half for sampled, outlines for the rest.
import { STATE_LABEL, type CollectionState } from '~~/shared/types';
defineProps<{ state: CollectionState }>();
</script>

<template>
  <span class="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-2">
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class="shrink-0">
      <circle v-if="state === 'owned'" cx="5" cy="5" r="4" fill="var(--ink)" />
      <template v-else-if="state === 'sampled'">
        <circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--ink)" stroke-width="1.2" />
        <path d="M5 1.5 A3.5 3.5 0 0 1 5 8.5 Z" fill="var(--ink)" />
      </template>
      <circle v-else-if="state === 'wishlist'" cx="5" cy="5" r="3.5" fill="none" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="2 1.6" />
      <circle v-else-if="state === 'previously_owned'" cx="5" cy="5" r="3.5" fill="none" stroke="var(--ink-3)" stroke-width="1.2" />
      <template v-else>
        <circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--ink-3)" stroke-width="1.2" />
        <path d="M2.5 7.5 L7.5 2.5" stroke="var(--ink-3)" stroke-width="1.2" />
      </template>
    </svg>
    <span :class="state === 'owned' ? 'text-ink' : ''">{{ STATE_LABEL[state] }}</span>
  </span>
</template>
