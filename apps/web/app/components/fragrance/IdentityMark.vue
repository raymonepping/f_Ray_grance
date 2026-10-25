<script setup lang="ts">
// Identity verification readout. The phosphor signal appears only for a verified identity.
defineProps<{ status: string; compact?: boolean }>();
</script>

<template>
  <span v-if="status === 'verified'" class="readout inline-flex items-center gap-2 whitespace-nowrap text-[12px] text-signal-text">
    <span class="signal-dot" aria-hidden="true" /><span :class="compact ? 'sr-only' : ''">Verified</span>
  </span>
  <span v-else class="readout inline-flex items-center gap-2 whitespace-nowrap text-[12px] text-warn">
    <span class="size-1.5 rounded-full border border-warn" aria-hidden="true" />Unverified draft
  </span>
</template>
