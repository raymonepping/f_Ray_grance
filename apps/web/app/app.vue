<script setup lang="ts">
const { apply } = usePreferences();
onMounted(apply);
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
