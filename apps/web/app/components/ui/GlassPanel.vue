<script setup lang="ts">
// Shared surface variants (DESIGN §7): glass only for shell/overlays; data uses solid.
withDefaults(defineProps<{ variant?: 'solid' | 'glass' | 'overlay' | 'subtle'; as?: string }>(), { variant: 'solid', as: 'div' });
</script>

<template>
  <component
    :is="as"
    :class="{
      'surface-solid rounded-card': variant === 'solid',
      'glass rounded-card': variant === 'glass',
      'glass-strong rounded-card shadow-[var(--shadow-2)]': variant === 'overlay',
      'rounded-card border border-line bg-transparent': variant === 'subtle',
    }"
  >
    <slot />
  </component>
</template>
