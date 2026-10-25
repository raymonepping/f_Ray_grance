<script setup lang="ts">
// The Spectral F: a geometric F on a 32-unit construction grid. The solid stem is the ray;
// its arms are spectral lines that step down in length and weight, like light split through
// a prism. One colour (currentColor) so it holds in both themes.
withDefaults(defineProps<{ size?: number; title?: string }>(), { size: 32, title: 'F-Ray-grance' });
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 32 32" role="img" :aria-label="title" class="shrink-0">
    <title>{{ title }}</title>
    <!-- stem: the ray -->
    <rect x="7" y="4" width="4" height="24" rx="0.6" fill="currentColor" />
    <!-- upper arm: three spectral lines -->
    <rect x="12.5" y="4" width="15.5" height="3" rx="0.4" fill="currentColor" />
    <rect x="12.5" y="8.4" width="11.5" height="2" rx="0.3" fill="currentColor" opacity="0.72" />
    <rect x="12.5" y="11.6" width="7" height="1.4" rx="0.2" fill="currentColor" opacity="0.5" />
    <!-- middle arm: two spectral lines -->
    <rect x="12.5" y="15" width="11" height="3" rx="0.4" fill="currentColor" />
    <rect x="12.5" y="19.4" width="6" height="2" rx="0.3" fill="currentColor" opacity="0.6" />
  </svg>
</template>
