<script setup lang="ts">
import { STATE_LABEL, type HistoryEvent } from '~~/shared/types';
defineProps<{ events: HistoryEvent[] }>();
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
</script>

<template>
  <ol class="m-0 flex list-none flex-col gap-2 border-l border-line p-0 pl-4" aria-label="Status history">
    <li v-for="e in events" :key="e.id" class="relative">
      <span class="absolute -left-[21px] top-1.5 size-2.5 rounded-full border border-gold bg-canvas" aria-hidden="true" />
      <p class="m-0 text-sm">
        <time :datetime="e.occurred_at" class="text-ink-3">{{ when(e.occurred_at) }}</time> ·
        <template v-if="e.from_state">{{ STATE_LABEL[e.from_state] }} → </template><strong>{{ STATE_LABEL[e.to_state] }}</strong>
      </p>
      <p v-if="e.user_reason" class="m-0 text-sm text-ink-2 [overflow-wrap:anywhere]">“{{ e.user_reason }}”</p>
    </li>
  </ol>
</template>
