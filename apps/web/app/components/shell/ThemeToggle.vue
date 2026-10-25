<script setup lang="ts">
const { prefs, set } = usePreferences();
const order = ['system', 'dark', 'light'] as const;
const next = computed(() => order[(order.indexOf(prefs.value.theme) + 1) % order.length]!);
const icon = computed(() => (prefs.value.theme === 'system' ? 'monitor' : prefs.value.theme === 'dark' ? 'moon' : 'sun'));
</script>

<template>
  <IconButton :icon="icon" :label="`Theme: ${prefs.theme}. Switch to ${next}`" @click="set('theme', next)" />
</template>
