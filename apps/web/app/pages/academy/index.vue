<script setup lang="ts">
// Scent Academy landing: the learning path (six original lessons with resume state) and
// the explorer tools. Works without Scento or Ollama; lessons are local.
import { PROGRESS_LABEL, type Exercise } from '~~/shared/academy';

usePageHeader({ title: 'Scent Academy', crumbs: [{ label: 'Academy' }] });
useHead({ title: 'Scent Academy · F-Ray-grance' });
const { data, error, load, progressFor } = useAcademy();
const practice = ref<Exercise[]>([]);
onMounted(async () => {
  await load(true);
  try {
    practice.value = (await apiFetch<{ exercises: Exercise[] }>('/api/v1/academy/practice')).exercises;
  } catch {
    practice.value = [];
  }
});
const completed = computed(() => data.value?.lessons.filter((l) => progressFor(l.slug)?.status === 'completed').length ?? 0);
const next = computed(() => data.value?.lessons.find((l) => progressFor(l.slug)?.status !== 'completed'));
const openPractice = computed(() => practice.value.filter((p) => p.status !== 'completed').length);
const pad = (n: number) => String(n).padStart(2, '0');
const tools = [
  { to: '/academy/notes', title: 'Note explorer', body: 'Look up a material or note in the Scento reference.', icon: 'search' },
  { to: '/academy/families', title: 'Family explorer', body: 'Browse the family map and how families neighbour each other.', icon: 'compass' },
  { to: '/academy/glossary', title: 'Glossary', body: 'Short original definitions, each linked to its lesson.', icon: 'book' },
] as const;
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1>Scent Academy</h1>
        <p class="m-0 mt-2 max-w-[60ch] text-[15px] text-ink-2">Learn to describe what you smell. Six short original lessons, a reference lookup and a private blotter practice.</p>
      </div>
      <dl v-if="data" class="readout m-0 flex gap-6 text-right" aria-label="Learning progress">
        <div><dt class="etch">Lessons done</dt><dd class="m-0 mt-1 text-[22px] leading-none">{{ pad(completed) }}<span class="text-ink-3">/{{ pad(data.lessons.length) }}</span></dd></div>
        <div><dt class="etch">Open practice</dt><dd class="m-0 mt-1 text-[22px] leading-none">{{ pad(openPractice) }}</dd></div>
      </dl>
    </div>

    <StatusBanner v-if="error" tone="error" title="Academy unavailable">{{ error }} <button type="button" class="underline" @click="load(true)">Retry</button></StatusBanner>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <section class="bay overflow-hidden" aria-labelledby="path-h">
        <div class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="path-h" class="text-[19px]">Learning path</h2>
          <NuxtLink v-if="next" :to="`/academy/lessons/${next.slug}`" class="btn btn-primary h-9 min-h-0">
            {{ progressFor(next.slug)?.status === 'in_progress' ? 'Resume' : completed ? 'Continue' : 'Start' }} <AppIcon name="arrow" :size="16" />
          </NuxtLink>
        </div>
        <ol v-if="data" class="m-0 list-none p-0" aria-label="Lessons">
          <li v-for="(l, i) in data.lessons" :key="l.slug" class="relative border-b border-line last:border-b-0">
            <NuxtLink :to="`/academy/lessons/${l.slug}`" class="motion grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-4 px-5 py-4 text-ink no-underline hover:bg-raised/50">
              <span class="relative flex flex-col items-center pt-0.5" aria-hidden="true">
                <span
                  class="readout grid size-8 place-items-center rounded-full border text-[12px]"
                  :class="progressFor(l.slug)?.status === 'completed' ? 'border-ink bg-ink text-canvas' : progressFor(l.slug)?.status === 'in_progress' ? 'border-ink text-ink' : 'border-line-strong text-ink-3'"
                >
                  <AppIcon v-if="progressFor(l.slug)?.status === 'completed'" name="check" :size="14" />
                  <template v-else>{{ pad(i + 1) }}</template>
                </span>
              </span>
              <span class="min-w-0">
                <span class="block text-[15px] font-medium">{{ l.title }}</span>
                <span class="mt-1 block text-[13px] text-ink-2">{{ l.intro }}</span>
              </span>
              <span class="whitespace-nowrap pt-1 text-[12px] text-ink-3">
                {{ PROGRESS_LABEL[progressFor(l.slug)?.status ?? 'not_started'] }}<template v-if="progressFor(l.slug)?.status === 'in_progress'"> · {{ (progressFor(l.slug)?.position ?? 0) + 1 }}/{{ l.sections.length }}</template>
              </span>
            </NuxtLink>
          </li>
        </ol>
        <div v-else-if="!error" class="h-80 animate-pulse" aria-busy="true" aria-label="Loading lessons" />
        <p v-if="data" class="m-0 border-t border-line px-5 py-3 text-[12px] text-ink-3">{{ data.authorship }}</p>
      </section>

      <div class="flex flex-col gap-5">
        <NuxtLink to="/academy/practice" class="bay motion group relative flex flex-col gap-3 overflow-hidden p-5 text-ink no-underline hover:border-line-strong">
          <svg class="pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full text-line-strong" viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 55 L60 55 L80 20 L92 50 L110 8 L126 52 L150 38 L170 55 L300 55" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="flex items-center justify-between">
            <h2 class="text-[19px]">Train My Nose</h2>
            <AppIcon name="arrow" :size="18" class="text-ink-3 transition-transform group-hover:translate-x-0.5" />
          </div>
          <p class="m-0 max-w-[44ch] pb-8 text-[14px] text-ink-2">Smell a blotter at the opening, about 20 and about 60 minutes. Describe what changes. Private, and never scored.</p>
        </NuxtLink>
        <ul class="bay m-0 list-none overflow-hidden p-0" aria-label="Explore">
          <li v-for="t in tools" :key="t.to" class="border-b border-line last:border-b-0">
            <NuxtLink :to="t.to" class="motion flex items-start gap-3 px-5 py-4 text-ink no-underline hover:bg-raised/50">
              <span class="well grid size-9 shrink-0 place-items-center text-ink-2"><AppIcon :name="t.icon" :size="17" /></span>
              <span class="min-w-0">
                <span class="block text-[15px] font-medium">{{ t.title }}</span>
                <span class="mt-0.5 block text-[13px] text-ink-2">{{ t.body }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
