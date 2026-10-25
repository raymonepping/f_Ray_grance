<script setup lang="ts">
// Whole card is one link (no nested conflicting controls); long names wrap, never truncate
// into indistinguishable flankers (DESIGN §15). Neutral bottle silhouette — no invented photos.
import { CONCENTRATION_LABEL, type CollectionState } from '~~/shared/types';
defineProps<{ id: string; brand: string; name: string; concentration: string | null; state?: CollectionState; identityStatus?: string }>();
</script>

<template>
  <NuxtLink :to="`/fragrances/${id}`" class="surface-solid motion group flex h-full flex-col gap-3 rounded-card p-4 text-ink no-underline hover:border-line-strong">
    <div class="grid aspect-[4/3] place-items-center rounded-control bg-sunken" aria-hidden="true">
      <svg viewBox="0 0 64 80" class="h-3/5 text-ink-3" fill="none" stroke="currentColor" stroke-width="2"><rect x="26" y="4" width="12" height="10" rx="2" /><path d="M22 14h20v6H22z" /><rect x="12" y="20" width="40" height="54" rx="10" /></svg>
    </div>
    <div class="min-w-0">
      <p class="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{{ brand }}</p>
      <p class="m-0 text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{{ name }}</p>
      <p class="m-0 text-sm text-ink-2">{{ concentration ? CONCENTRATION_LABEL[concentration] ?? concentration : 'Concentration not recorded' }}</p>
    </div>
    <div class="mt-auto flex flex-wrap items-center gap-2">
      <FragranceCollectionStatusBadge v-if="state" :state="state" />
      <span v-if="identityStatus && identityStatus !== 'verified'" class="rounded-full border border-warn px-2.5 py-0.5 text-xs font-semibold text-warn">Unverified draft</span>
    </div>
  </NuxtLink>
</template>
