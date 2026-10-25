<script setup lang="ts">
usePageHeader({ title: 'My DNA' });
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1>My DNA</h1>
    <EmptyState
      icon="dna"
      title="Seasonal profiles are not built yet"
      body="My DNA will hold your own spring, summer, autumn and winter preferences — kept separate from provider suggestions, and never inferred from what you happen to own. It arrives in build phase 09."
    />
  </div>
</template>
