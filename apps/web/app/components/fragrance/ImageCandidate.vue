<script setup lang="ts">
// One image candidate from a barcode or web search. The preview is fetched and downscaled by the
// server (same origin); nothing is stored until the owner chooses "Use this image".
import type { ImageCandidate } from '~~/shared/types';
defineProps<{ candidate: ImageCandidate; name: string; busy: boolean }>();
defineEmits<{ use: [] }>();
const broken = ref(false);
</script>

<template>
  <li class="flex flex-col gap-2 rounded-control border border-line bg-panel p-2" :aria-label="`Candidate from ${candidate.siteName}`">
    <div class="relative aspect-[4/5] overflow-hidden rounded-[6px] border border-line bg-sunken">
      <img v-if="!broken" :src="candidate.previewUrl" :alt="`${candidate.title} (preview)`" loading="lazy" class="absolute inset-0 size-full object-contain" @error="broken = true" />
      <p v-else class="absolute inset-0 m-0 grid place-items-center p-2 text-center text-[12px] text-ink-3">Preview unavailable from this site</p>
    </div>
    <p class="m-0 line-clamp-2 text-[12px] font-medium text-ink [overflow-wrap:anywhere]" :title="candidate.title">{{ candidate.title }}</p>
    <p class="m-0 truncate text-[11px] text-ink-3">
      <a :href="candidate.pageUrl" target="_blank" rel="noopener noreferrer">{{ candidate.siteName }}<span class="sr-only"> (opens in a new tab)</span></a>
      <template v-if="candidate.barcode"> · <span class="readout">{{ candidate.barcode }}</span></template>
    </p>
    <p v-if="!candidate.exactName" class="m-0 text-[11px] text-warn">Name differs from “{{ name }}”. Check that this is your bottle.</p>
    <button type="button" class="btn btn-quiet h-8 min-h-0 px-2.5 text-[12px]" :disabled="busy || broken" @click="$emit('use')">Use this image</button>
  </li>
</template>
