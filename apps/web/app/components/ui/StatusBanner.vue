<script setup lang="ts">
// Neutral, actionable status (DESIGN §7). Announced politely to assistive tech.
withDefaults(defineProps<{ tone?: 'info' | 'warning' | 'error' | 'success'; title: string }>(), { tone: 'info' });
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="surface-solid flex items-start gap-3 rounded-control px-4 py-3"
    :class="{ 'border-warn!': tone === 'warning', 'border-bad!': tone === 'error', 'border-ok!': tone === 'success' }"
  >
    <AppIcon :name="tone === 'error' ? 'alert' : tone === 'warning' ? 'offline' : tone === 'success' ? 'shield' : 'info'" class="mt-0.5" :class="{ 'text-warn': tone === 'warning', 'text-bad': tone === 'error', 'text-ok': tone === 'success', 'text-blue': tone === 'info' }" />
    <div class="min-w-0">
      <p class="m-0 font-semibold">{{ title }}</p>
      <div class="text-sm text-ink-2"><slot /></div>
    </div>
  </div>
</template>
