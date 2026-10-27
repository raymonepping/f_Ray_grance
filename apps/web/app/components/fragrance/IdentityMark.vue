<script setup lang="ts">
// Identity readout. The phosphor signal appears only for a Scento-verified identity; an identity the
// owner confirmed from a shop page (ADR-023) reads "Confirmed by you" in ink.
defineProps<{ status: string; compact?: boolean }>();
</script>

<template>
  <span v-if="status === 'verified'" class="readout inline-flex items-center gap-2 whitespace-nowrap text-[12px] text-signal-text">
    <span class="signal-dot" aria-hidden="true" /><span :class="compact ? 'sr-only' : ''">Verified</span>
  </span>
  <span v-else-if="status === 'owner_confirmed'" class="readout inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-ink-2" data-testid="identity-owner-confirmed">
    <AppIcon name="check" :size="12" /><span :class="compact ? 'sr-only' : ''">Confirmed by you</span>
  </span>
  <span v-else class="readout inline-flex items-center gap-2 whitespace-nowrap text-[12px] text-warn">
    <span class="size-1.5 rounded-full border border-warn" aria-hidden="true" />Unverified draft
  </span>
</template>
