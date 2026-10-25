<script setup lang="ts">
import { computed, ref, watch } from 'vue';
// One image component for every surface. Stable 4:5 frame, lazy loading, and a quiet placeholder
// that says so in words when there is no verified image (or the file fails to load): never a broken
// image icon, never an invented bottle.
const props = withDefaults(defineProps<{ imageId?: string | null; alt: string; size?: 'thumb' | 'card' | 'hero' }>(), { imageId: null, size: 'card' });
const failed = ref(false);
watch(() => props.imageId, () => (failed.value = false));
const src = computed(() => (props.imageId && !failed.value ? `/api/v1/images/${props.imageId}/display` : null));
const frame = computed(() => ({ thumb: 'w-10 rounded-[6px]', card: 'w-16 rounded-control', hero: 'w-full rounded-control' })[props.size]);
</script>

<template>
  <div class="relative aspect-[4/5] shrink-0 overflow-hidden border border-line bg-sunken" :class="frame" data-testid="fragrance-image">
    <img v-if="src" :src="src" :alt="alt" loading="lazy" decoding="async" class="absolute inset-0 size-full object-cover" @error="failed = true" />
    <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center" :title="size === 'hero' ? undefined : 'No verified image yet'">
      <svg viewBox="0 0 40 50" class="text-line-strong" :class="size === 'hero' ? 'w-12' : size === 'card' ? 'w-6' : 'w-4'" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
        <rect x="16" y="3" width="8" height="6" rx="1" />
        <rect x="8" y="12" width="24" height="34" rx="4" stroke-dasharray="2.5 2.5" />
      </svg>
      <span v-if="size === 'hero'" class="text-[12px] text-ink-3">No verified image yet</span>
      <span v-else class="sr-only">No verified image yet</span>
    </div>
  </div>
</template>
