<script setup lang="ts">
// Shared surface variants. All panels are opaque (one elevation language); only the
// sticky header is translucent. Name kept for compatibility with existing pages.
withDefaults(defineProps<{ variant?: 'solid' | 'bay' | 'overlay' | 'subtle'; as?: string }>(), { variant: 'solid', as: 'div' });
</script>

<template>
  <component
    :is="as"
    :class="{
      'bay rounded-card': variant === 'solid' || variant === 'bay',
      'bay rounded-card shadow-[var(--shadow-2)]': variant === 'overlay',
      'rounded-card border border-line bg-transparent': variant === 'subtle',
    }"
  >
    <slot />
  </component>
</template>
