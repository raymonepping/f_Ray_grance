<script setup lang="ts">
const { ids, set, url } = useCompare();
const route = useRoute();
</script>
<template>
  <aside v-if="ids.length && route.path !== '/compare'" aria-label="Compare selection" class="bay fixed inset-x-4 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-2 rounded-control p-1.5 shadow-[var(--shadow-2)] md:inset-x-auto md:right-6 md:bottom-5">
    <NuxtLink :to="url" class="btn btn-quiet h-9 min-h-0"><AppIcon name="columns" :size="15" /> Compare ({{ ids.length }}/2)</NuxtLink>
    <button class="btn btn-ghost h-9 min-h-0" type="button" @click="set([])">Clear</button>
  </aside>
</template>
