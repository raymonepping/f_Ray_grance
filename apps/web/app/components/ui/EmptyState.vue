<script setup lang="ts">
defineProps<{ title: string; body: string; actionLabel?: string; actionTo?: string; icon?: 'library' | 'compass' | 'columns' | 'dna' | 'search' | 'info' | 'academy' }>();
</script>

<template>
  <GlassPanel variant="solid" class="relative mx-auto flex max-w-xl flex-col items-center gap-4 overflow-hidden px-8 py-10 text-center">
    <svg class="pointer-events-none absolute inset-x-0 top-0 h-16 w-full text-line-strong" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 63 L120 63 L140 40 L150 58 L170 20 L185 60 L200 48 L215 63 L400 63" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" />
    </svg>
    <span class="well mt-6 grid size-11 place-items-center text-ink-2"><AppIcon :name="icon ?? 'info'" :size="20" /></span>
    <h2>{{ title }}</h2>
    <p class="m-0 max-w-[46ch] text-ink-2">{{ body }}</p>
    <slot />
    <NuxtLink v-if="actionLabel && actionTo" :to="actionTo" class="btn btn-primary">
      {{ actionLabel }} <AppIcon name="arrow" :size="16" />
    </NuxtLink>
  </GlassPanel>
</template>
