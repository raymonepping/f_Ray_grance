<script setup lang="ts">
// Local tutor. Without a configured generative model it says so plainly and shows the
// curated lesson explanation; it never fabricates an answer. Questions are not stored.
import type { TutorResponse } from '~~/shared/academy';

const props = defineProps<{ lesson: string }>();
const question = ref('');
const busy = ref(false);
const res = ref<TutorResponse | null>(null);
const error = ref('');
const STATUS: Record<string, string> = {
  NO_GENERATIVE_MODEL: 'No local generative model configured',
  EMBEDDING_ONLY_MODEL: 'Configured model is embedding-only',
  MODEL_NOT_INSTALLED: 'Configured model is not installed',
  TUTOR_UNAVAILABLE: 'Local tutor unavailable',
};
async function ask() {
  busy.value = true;
  error.value = '';
  try {
    res.value = await apiFetch<TutorResponse>('/api/v1/academy/tutor', { method: 'POST', body: { lesson: props.lesson, question: question.value.trim() } });
  } catch (e) {
    error.value = e instanceof ApiFailure && e.code === 'RATE_LIMITED' ? 'Question limit reached for now. Try again in a minute.' : e instanceof ApiFailure ? e.message : 'The tutor could not be reached.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="bay flex flex-col gap-4 p-5" aria-labelledby="tutor-h">
    <div class="flex items-center justify-between gap-3">
      <h2 id="tutor-h" class="text-[19px]">Ask the local tutor</h2>
      <span class="readout text-[11px] text-ink-3">On this Mac</span>
    </div>
    <form class="flex flex-col gap-2" @submit.prevent="ask">
      <label for="tutor-q" class="text-[13px] font-medium text-ink-2">Your question about this lesson</label>
      <textarea id="tutor-q" v-model="question" maxlength="600" rows="3" class="field" placeholder="e.g. Why can a base note show up early?" />
      <div class="flex items-center justify-between gap-3">
        <span class="readout text-[11px] text-ink-3">{{ question.length }}/600</span>
        <button type="submit" class="btn btn-quiet" :disabled="busy || !question.trim()">{{ busy ? 'Asking…' : 'Ask' }}</button>
      </div>
    </form>
    <p v-if="error" role="alert" class="m-0 text-[13px] text-bad">{{ error }}</p>
    <div v-if="res" class="flex flex-col gap-3 border-t border-line pt-4" role="status" aria-live="polite" data-testid="tutor-result">
      <template v-if="res.available && res.answer">
        <p class="etch m-0">Generated locally<span v-if="res.model" class="normal-case tracking-normal"> · {{ res.model }}</span></p>
        <p class="m-0 whitespace-pre-line text-[14px]">{{ res.answer }}</p>
      </template>
      <template v-else>
        <p class="m-0 flex items-center gap-2 text-[14px] font-medium text-warn"><AppIcon name="info" :size="16" /> {{ STATUS[res.status] ?? 'Local tutor unavailable' }}</p>
        <p class="etch m-0">Lesson explanation</p>
        <p class="m-0 whitespace-pre-line text-[14px] text-ink-2">{{ res.curated }}</p>
      </template>
      <p class="m-0 text-[12px] text-ink-3">{{ res.notice }}</p>
      <ul class="m-0 list-none p-0 text-[12px] text-ink-3" aria-label="Sources">
        <li v-for="s in res.sources" :key="s.label">
          Source: <NuxtLink v-if="s.url?.startsWith('/')" :to="s.url">{{ s.label }}</NuxtLink><a v-else-if="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.label }}</a><span v-else>{{ s.label }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
