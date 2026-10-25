<script setup lang="ts">
// One original lesson, read section by section. Position is saved as you move, so the
// lesson resumes where you left it (against its content version).
import type { GlossaryEntry } from '~~/shared/academy';

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const { data, error, load, progressFor, saveProgress } = useAcademy();
const lesson = computed(() => data.value?.lessons.find((l) => l.slug === slug.value) ?? null);
const index = computed(() => data.value?.lessons.findIndex((l) => l.slug === slug.value) ?? -1);
const nextLesson = computed(() => (index.value >= 0 ? data.value?.lessons[index.value + 1] : undefined));
const pos = ref(0);
const saveError = ref('');
const glossary = ref<GlossaryEntry[]>([]);
const keyTerm = computed(() => glossary.value.find((g) => g.term === lesson.value?.term || g.lexicon === lesson.value?.term));
const status = computed(() => progressFor(slug.value)?.status ?? 'not_started');
const showLexicon = ref(false);

async function init() {
  await load();
  const p = progressFor(slug.value);
  pos.value = p && lesson.value ? Math.min(p.position, lesson.value.sections.length - 1) : 0;
  usePageHeader({ title: lesson.value?.title ?? 'Lesson', crumbs: [{ label: 'Academy', to: '/academy' }, { label: lesson.value?.title ?? 'Lesson' }] });
  useHead({ title: `${lesson.value?.title ?? 'Lesson'} · Scent Academy` });
}
watch(slug, () => { showLexicon.value = false; void init(); }, { immediate: true });
onMounted(async () => {
  try {
    glossary.value = (await apiFetch<{ glossary: GlossaryEntry[] }>('/api/v1/academy/glossary')).glossary;
  } catch {
    glossary.value = [];
  }
});

async function persist(next: 'in_progress' | 'completed', position: number) {
  saveError.value = '';
  try {
    await saveProgress(slug.value, next, position);
  } catch (e) {
    saveError.value = e instanceof ApiFailure ? `Progress not saved: ${e.message}` : 'Progress not saved.';
  }
}
async function go(to: number) {
  if (!lesson.value) return;
  pos.value = Math.max(0, Math.min(to, lesson.value.sections.length - 1));
  if (status.value !== 'completed') await persist('in_progress', pos.value);
  document.getElementById('lesson-section')?.focus();
}
async function complete() {
  if (!lesson.value) return;
  await persist('completed', lesson.value.sections.length - 1);
}
const last = computed(() => !!lesson.value && pos.value === lesson.value.sections.length - 1);
</script>

<template>
  <div class="flex flex-col gap-6">
    <StatusBanner v-if="error" tone="error" title="Lesson unavailable">{{ error }} <button type="button" class="underline" @click="load(true)">Retry</button></StatusBanner>
    <EmptyState v-else-if="data && !lesson" icon="academy" title="Lesson not found" body="This lesson does not exist. Choose one from the learning path." action-label="Back to the Academy" action-to="/academy" />
    <template v-else-if="lesson">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="max-w-[24ch]">{{ lesson.title }}</h1>
          <p class="m-0 mt-2 max-w-[60ch] text-[15px] text-ink-2">{{ lesson.intro }}</p>
        </div>
        <div class="flex flex-col items-end gap-1.5">
        <span class="readout text-[12px] text-ink-3">Lesson {{ String(index + 1).padStart(2, '0') }}/{{ String(data!.lessons.length).padStart(2, '0') }} · v{{ lesson.version }}</span>
        <span v-if="status === 'completed'" class="inline-flex items-center gap-2 text-[12px] text-ink" data-testid="lesson-status"><AppIcon name="check" :size="14" /> Completed</span>
        <span v-else-if="status === 'in_progress'" class="text-[12px] text-ink-2" data-testid="lesson-status">In progress</span>
        </div>
      </div>

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div class="flex min-w-0 flex-col gap-5">
          <article class="bay flex flex-col" aria-labelledby="section-h">
            <div class="flex items-center gap-2 border-b border-line px-5 py-3" role="group" aria-label="Lesson sections">
              <button
                v-for="(s, i) in lesson.sections"
                :key="s.title"
                type="button"
                class="motion h-1.5 flex-1 rounded-full"
                :class="i <= pos ? 'bg-ink' : 'bg-line-strong'"
                :aria-label="`Section ${i + 1}: ${s.title}`"
                :aria-current="i === pos ? 'step' : undefined"
                @click="go(i)"
              />
              <span class="readout ml-2 text-[12px] text-ink-3">{{ pos + 1 }}/{{ lesson.sections.length }}</span>
            </div>
            <div id="lesson-section" tabindex="-1" class="flex flex-col gap-3 px-5 py-6 focus:outline-none md:px-8 md:py-8">
              <h2 id="section-h" class="text-[19px]">{{ lesson.sections[pos]!.title }}</h2>
              <p class="m-0 max-w-[66ch] text-[15px] leading-[1.7] text-ink">{{ lesson.sections[pos]!.text }}</p>
            </div>
            <div v-if="last" class="mx-5 mb-5 rounded-control border border-line bg-sunken p-4 md:mx-8">
              <p class="m-0 max-w-[66ch] text-[14px]"><strong class="font-medium">Try this.</strong> {{ lesson.task }}</p>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
              <button type="button" class="btn btn-ghost" :disabled="pos === 0" @click="go(pos - 1)"><AppIcon name="back" :size="16" /> Previous</button>
              <div class="flex flex-wrap gap-2">
                <button v-if="!last" type="button" class="btn btn-primary" @click="go(pos + 1)">Next section <AppIcon name="arrow" :size="16" /></button>
                <button v-else-if="status !== 'completed'" type="button" class="btn btn-primary" @click="complete">Mark lesson complete</button>
                <NuxtLink v-else-if="nextLesson" :to="`/academy/lessons/${nextLesson.slug}`" class="btn btn-primary">Next lesson <AppIcon name="arrow" :size="16" /></NuxtLink>
                <NuxtLink v-else to="/academy/practice" class="btn btn-primary">Start Train My Nose <AppIcon name="arrow" :size="16" /></NuxtLink>
              </div>
            </div>
            <p v-if="saveError" role="alert" class="m-0 px-5 pb-4 text-[13px] text-bad">{{ saveError }}</p>
          </article>
        </div>

        <div class="flex min-w-0 flex-col gap-5">
          <section v-if="keyTerm" class="bay flex flex-col gap-3 p-5" aria-labelledby="term-h">
            <h2 id="term-h" class="text-[15px] text-ink-2">Key term</h2>
            <p class="m-0 text-[14px] text-ink-2"><dfn class="text-[19px] font-medium not-italic capitalize text-ink">{{ keyTerm.term }}</dfn><br />{{ keyTerm.text }}</p>
            <div class="flex flex-wrap gap-2">
              <NuxtLink to="/academy/glossary" class="btn btn-ghost h-9 min-h-0 px-2.5 text-[13px]"><AppIcon name="book" :size="15" /> Glossary</NuxtLink>
              <button v-if="keyTerm.lexicon && !showLexicon" type="button" class="btn btn-ghost h-9 min-h-0 px-2.5 text-[13px]" @click="showLexicon = true">
                <AppIcon name="external" :size="15" /> Look up in the Scento lexicon
              </button>
            </div>
            <AcademyReferenceLookup v-if="showLexicon && keyTerm.lexicon" kind="term" label="Lexicon term" :initial="keyTerm.lexicon" auto />
          </section>
          <AcademyTutorPanel :lesson="lesson.slug" />
        </div>
      </div>
    </template>
    <div v-else class="bay h-80 animate-pulse" aria-busy="true" aria-label="Loading lesson" />
  </div>
</template>
