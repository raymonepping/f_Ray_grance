<script setup lang="ts">
// A Scento educational folio, rendered as plain text with attribution. Provider HTML is
// never rendered; links are allowlisted server-side to https://www.scento.com.
import type { Folio } from '~~/shared/academy';
defineProps<{ folio: Folio }>();
defineEmits<{ pick: [term: string] }>();
const checked = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <article class="bay flex flex-col gap-4 p-5 md:p-6" :aria-label="`Reference: ${folio.title}`" lang="en">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <h3 class="text-[19px]">{{ folio.title }}</h3>
      <span class="readout rounded-[4px] border border-line px-1.5 py-0.5 text-[11px] text-ink-2">Scento · English</span>
    </div>
    <p v-if="folio.lede" class="m-0 max-w-[70ch] text-ink-2">{{ folio.lede }}</p>
    <dl v-if="folio.facts.length" class="m-0 grid gap-x-6 gap-y-3 text-[14px] md:grid-cols-[max-content_1fr]">
      <template v-for="f in folio.facts" :key="f.label">
        <dt class="etch pt-0.5">{{ f.label }}</dt>
        <dd class="m-0 max-w-[70ch] text-ink [overflow-wrap:anywhere]">{{ f.value }}</dd>
      </template>
    </dl>
    <div v-if="folio.related.length" class="flex flex-col gap-2">
      <p class="etch m-0">{{ folio.kind === 'families' ? 'Families' : 'Related' }}</p>
      <ul class="m-0 grid list-none gap-px overflow-hidden rounded-control border border-line bg-line p-0 sm:grid-cols-2">
        <li v-for="r in folio.related" :key="r.label" class="bg-panel">
          <button
            v-if="r.url?.startsWith('family:')"
            type="button"
            class="motion flex h-full w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-raised"
            @click="$emit('pick', r.url.slice(7))"
          >
            <span class="text-[14px] font-medium text-ink">{{ r.label }}</span>
            <span v-if="r.detail" class="line-clamp-2 text-[13px] text-ink-3">{{ r.detail }}</span>
          </button>
          <div v-else class="flex h-full flex-col gap-1 px-4 py-3">
            <a v-if="r.url" :href="r.url" target="_blank" rel="noopener noreferrer" class="text-[14px] font-medium">{{ r.label }}<span class="sr-only"> (opens Scento in a new tab)</span></a>
            <span v-else class="text-[14px] font-medium">{{ r.label }}</span>
            <span v-if="r.detail" class="line-clamp-2 text-[13px] text-ink-3">{{ r.detail }}</span>
          </div>
        </li>
      </ul>
    </div>
    <p class="m-0 border-t border-line pt-3 text-[12px] text-ink-3">
      {{ folio.attribution }}
      <template v-if="folio.sourceUrl"> · <a :href="folio.sourceUrl" target="_blank" rel="noopener noreferrer">{{ folio.sourceLabel }}<span class="sr-only"> (opens in a new tab)</span></a></template>
      · checked <span class="readout">{{ checked(folio.fetchedAt) }}</span>
    </p>
  </article>
</template>
