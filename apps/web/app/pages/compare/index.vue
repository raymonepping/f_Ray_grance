<script setup lang="ts">
usePageHeader({ title: 'Compare' });
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1>Compare</h1>
    <EmptyState
      icon="columns"
      title="Two-fragrance Compare is not built yet"
      body="Compare will put two verified fragrances side by side: sourced pyramids, the same 0–5 trait axes, and a plain-language explanation of what differs. It arrives in build phase 07."
      action-label="Verify fragrances in Discover"
      action-to="/discover"
    />
  </div>
</template>
