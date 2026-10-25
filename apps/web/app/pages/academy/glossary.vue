<script setup lang="ts">
// Original short definitions, each linked to the lesson that teaches it.
import type { GlossaryEntry } from '~~/shared/academy';
usePageHeader({ title: 'Glossary', crumbs: [{ label: 'Academy', to: '/academy' }, { label: 'Glossary' }] });
useHead({ title: 'Glossary · Scent Academy' });
const items = ref<GlossaryEntry[] | null>(null);
const error = ref('');
const filter = ref('');
const open = ref<string | null>(null);
onMounted(async () => {
  try {
    items.value = (await apiFetch<{ glossary: GlossaryEntry[] }>('/api/v1/academy/glossary')).glossary;
  } catch (e) {
    error.value = e instanceof ApiFailure ? e.message : 'Could not load the glossary';
  }
});
const shown = computed(() => (items.value ?? []).filter((g) => !filter.value.trim() || `${g.term} ${g.text}`.toLowerCase().includes(filter.value.trim().toLowerCase())));
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1>Glossary</h1>
        <p class="m-0 mt-2 max-w-[60ch] text-[15px] text-ink-2">Short original definitions. Each term links to the lesson that explains it.</p>
      </div>
      <div class="flex w-full flex-col gap-1.5 sm:w-72">
        <label for="glossary-filter" class="text-[13px] font-medium text-ink-2">Filter terms</label>
        <input id="glossary-filter" v-model="filter" type="search" class="field" />
      </div>
    </div>
    <StatusBanner v-if="error" tone="error" title="Glossary unavailable">{{ error }}</StatusBanner>
    <dl v-else-if="items" class="bay m-0 overflow-hidden">
      <div v-for="g in shown" :key="g.term" class="grid gap-x-6 gap-y-1 border-b border-line px-5 py-4 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
        <dt class="text-[15px] font-medium capitalize">{{ g.term }}</dt>
        <dd class="m-0 text-[14px] text-ink-2">
          {{ g.text }}
          <AcademyReferenceLookup v-if="open === g.term && g.lexicon" class="mt-4" kind="term" label="Lexicon term" :initial="g.lexicon" auto />
        </dd>
        <dd class="m-0 flex flex-wrap items-start gap-1 md:justify-end">
          <NuxtLink :to="`/academy/lessons/${g.lesson}`" class="btn btn-ghost h-8 min-h-0 px-2.5 text-[13px]" :aria-label="`Lesson for ${g.term}`">Lesson</NuxtLink>
          <button v-if="g.lexicon && open !== g.term" type="button" class="btn btn-ghost h-8 min-h-0 px-2.5 text-[13px]" :aria-label="`Look up ${g.term} in the Scento lexicon`" @click="open = g.term">Lexicon</button>
        </dd>
      </div>
      <p v-if="!shown.length" class="m-0 px-5 py-6 text-ink-2">No terms match.</p>
    </dl>
    <div v-else class="bay h-80 animate-pulse" aria-busy="true" aria-label="Loading glossary" />
  </div>
</template>
