<script setup lang="ts">
const { ids, set, url } = useCompare();
const route = useRoute();
</script>
<template>
  <aside v-if="ids.length && route.path !== '/compare'" aria-label="Compare selection" class="surface-solid fixed inset-x-4 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 flex items-center justify-center gap-3 rounded-control p-2 md:inset-x-auto md:right-6 md:bottom-5">
    <NuxtLink :to="url" class="tap inline-flex items-center">Compare ({{ ids.length }}/2)</NuxtLink>
    <button class="tap px-2 underline" type="button" @click="set([])">Clear</button>
  </aside>
</template>
