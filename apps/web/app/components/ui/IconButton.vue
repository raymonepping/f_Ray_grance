<script setup lang="ts">
// Icon-only actions always carry an accessible name (DESIGN §11).
defineProps<{ label: string; icon: 'search' | 'plus' | 'sun' | 'moon' | 'monitor' | 'menu' | 'close' | 'collapse' | 'expand' | 'logout' | 'settings'; pressed?: boolean }>();
</script>

<template>
  <button
    type="button"
    class="motion inline-flex size-9 items-center justify-center rounded-control border border-transparent text-ink-2 hover:border-line hover:bg-raised hover:text-ink pointer-coarse:size-11"
    :aria-label="label"
    :title="label"
    :aria-pressed="pressed === undefined ? undefined : pressed"
  >
    <AppIcon :name="icon" :size="18" />
  </button>
</template>
