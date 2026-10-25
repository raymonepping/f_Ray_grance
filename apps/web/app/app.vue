<script setup lang="ts">
const { apply } = usePreferences();
let media: MediaQueryList | undefined;
onMounted(() => { apply(); media = matchMedia('(prefers-color-scheme: light)'); media.addEventListener('change', apply); });
onBeforeUnmount(() => media?.removeEventListener('change', apply));
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
