<script setup lang="ts">
defineProps<{ title: string; body: string; actionLabel?: string; actionTo?: string; icon?: 'library' | 'compass' | 'columns' | 'dna' | 'search' | 'info' }>();
</script>

<template>
  <GlassPanel variant="solid" class="mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
    <span class="rounded-full border border-line p-3 text-gold"><AppIcon :name="icon ?? 'info'" :size="24" /></span>
    <h2>{{ title }}</h2>
    <p class="m-0 text-ink-2">{{ body }}</p>
    <slot />
    <NuxtLink
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="tap motion inline-flex items-center gap-2 rounded-control bg-gold px-5 py-2.5 font-semibold text-gold-ink no-underline hover:brightness-110"
    >
      {{ actionLabel }} <AppIcon name="arrow" :size="18" />
    </NuxtLink>
  </GlassPanel>
</template>
