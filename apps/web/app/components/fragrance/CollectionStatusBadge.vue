<script setup lang="ts">
import { STATE_LABEL, type CollectionState } from '~~/shared/types';
defineProps<{ state: CollectionState }>();
</script>

<template>
  <span class="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold">
    <span class="size-1.5 rounded-full" :class="{ 'bg-gold': state === 'owned', 'bg-blue': state === 'sampled', 'bg-ink-3': state === 'previously_owned' || state === 'rejected', 'bg-ok': state === 'wishlist' }" aria-hidden="true" />
    {{ STATE_LABEL[state] }}
  </span>
</template>
