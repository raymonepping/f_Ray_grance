<script setup lang="ts">
// Neutral, actionable status. Announced politely to assistive tech. Tone shows as a
// leading rule plus icon, so it never relies on colour alone.
withDefaults(defineProps<{ tone?: 'info' | 'warning' | 'error' | 'success'; title: string }>(), { tone: 'info' });
</script>

<template>
  <div role="status" aria-live="polite" class="bay relative flex items-start gap-3 overflow-hidden rounded-control py-3 pl-5 pr-4">
    <span
      class="absolute inset-y-0 left-0 w-[3px]"
      :class="{ 'bg-warn': tone === 'warning', 'bg-bad': tone === 'error', 'bg-ink': tone === 'success', 'bg-line-strong': tone === 'info' }"
      aria-hidden="true"
    />
    <AppIcon
      :name="tone === 'error' ? 'alert' : tone === 'warning' ? 'offline' : tone === 'success' ? 'shield' : 'info'"
      :size="18"
      class="mt-0.5"
      :class="{ 'text-warn': tone === 'warning', 'text-bad': tone === 'error', 'text-ink': tone === 'success', 'text-ink-2': tone === 'info' }"
    />
    <div class="min-w-0">
      <p class="m-0 text-[14px] font-medium">{{ title }}</p>
      <div class="text-[13px] text-ink-2"><slot /></div>
    </div>
  </div>
</template>
