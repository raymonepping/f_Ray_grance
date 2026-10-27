<script setup lang="ts">
// The Spectral F: a geometric F on a 32-unit construction grid. The solid stem is the ray, in ink
// (currentColor). Its arms are spectral lines that step down in length and weight, like light split
// through a prism, coloured along the spectral ramp from fresh lime to warm orange (ADR-019).
// Under forced colours every line falls back to currentColor.
withDefaults(defineProps<{ size?: number; title?: string }>(), { size: 32, title: 'F-Ray-grance' });
const arm = (warmShare: number) => ({ fill: `color-mix(in oklab, var(--spectrum-warm) ${warmShare}%, var(--spectrum-fresh))` });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 32 32" role="img" :aria-label="title" class="shrink-0">
    <title>{{ title }}</title>
    <!-- stem: the ray -->
    <rect x="7" y="4" width="4" height="24" rx="0.6" fill="currentColor" />
    <!-- upper arm: three spectral lines -->
    <rect class="arm" x="12.5" y="4" width="15.5" height="3" rx="0.4" :style="arm(0)" />
    <rect class="arm" x="12.5" y="8.4" width="11.5" height="2" rx="0.3" :style="arm(25)" opacity="0.85" />
    <rect class="arm" x="12.5" y="11.6" width="7" height="1.4" rx="0.2" :style="arm(50)" opacity="0.7" />
    <!-- middle arm: two spectral lines -->
    <rect class="arm" x="12.5" y="15" width="11" height="3" rx="0.4" :style="arm(75)" />
    <rect class="arm" x="12.5" y="19.4" width="6" height="2" rx="0.3" :style="arm(100)" opacity="0.8" />
  </svg>
</template>

<style scoped>
@media (forced-colors: active) {
  .arm { fill: currentColor !important; }
}
</style>
