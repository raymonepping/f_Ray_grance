<script setup lang="ts">
// Train My Nose: start a blotter exercise for your own owned or sampled fragrance, or a
// generic blotter. No timers, no daily obligation; stop and resume any time.
import type { Exercise } from '~~/shared/academy';
import { STATE_LABEL, type CollectionState } from '~~/shared/types';

usePageHeader({ title: 'Train My Nose', crumbs: [{ label: 'Academy', to: '/academy' }, { label: 'Train My Nose' }] });
useHead({ title: 'Train My Nose · Scent Academy' });
interface Entry { id: string; state: CollectionState; brand: string; canonical_name: string }
const exercises = ref<Exercise[] | null>(null);
const entries = ref<Entry[]>([]);
const error = ref('');
const entryId = ref('');
const title = ref('');
const busy = ref(false);
const message = ref('');
async function load() {
  error.value = '';
  try {
    const [p, c] = await Promise.all([
      apiFetch<{ exercises: Exercise[] }>('/api/v1/academy/practice'),
      apiFetch<{ items: Entry[] }>('/api/v1/collection'),
    ]);
    exercises.value = p.exercises;
    entries.value = c.items.filter((e) => e.state === 'owned' || e.state === 'sampled');
  } catch (e) {
    error.value = e instanceof ApiFailure ? e.message : 'Could not load your practice';
  }
}
onMounted(load);
watch(entryId, (id) => {
  const e = entries.value.find((x) => x.id === id);
  title.value = e ? `${e.canonical_name} blotter` : '';
});
async function start() {
  busy.value = true;
  message.value = '';
  try {
    const created = await apiFetch<Exercise>('/api/v1/academy/practice', { method: 'POST', body: { title: title.value.trim() || 'Blotter exercise', ...(entryId.value ? { entryId: entryId.value } : {}) } });
    await navigateTo(`/academy/practice/${created.id}`);
  } catch (e) {
    message.value = e instanceof ApiFailure ? `Not started: ${e.message}` : 'Not started.';
  } finally {
    busy.value = false;
  }
}
const STATUS_LABEL = { active: 'Active', paused: 'Paused', completed: 'Completed' } as const;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1>Train My Nose</h1>
      <p class="m-0 mt-2 max-w-[62ch] text-[15px] text-ink-2">Smell a blotter at the opening, about 20 and about 60 minutes, and describe what changes. Your descriptions are private and never scored against a pyramid.</p>
    </div>
    <StatusBanner v-if="error" tone="error" title="Practice unavailable">{{ error }} <button type="button" class="underline" @click="load">Retry</button></StatusBanner>
    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section class="bay flex h-fit flex-col gap-4 p-5" aria-labelledby="start-h">
        <h2 id="start-h" class="text-[19px]">Start an exercise</h2>
        <form class="flex flex-col gap-4" @submit.prevent="start">
          <div class="flex flex-col gap-1.5">
            <label for="practice-entry" class="text-[13px] font-medium text-ink-2">Fragrance</label>
            <select id="practice-entry" v-model="entryId" class="field pr-8">
              <option value="">Generic blotter (no fragrance)</option>
              <option v-for="e in entries" :key="e.id" :value="e.id">{{ e.canonical_name }} · {{ e.brand }} ({{ STATE_LABEL[e.state] }})</option>
            </select>
            <p class="m-0 text-[12px] text-ink-3">Only your owned fragrances and samples are listed.</p>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="practice-title" class="text-[13px] font-medium text-ink-2">Name</label>
            <input id="practice-title" v-model="title" maxlength="100" class="field" placeholder="Blotter exercise" />
          </div>
          <button type="submit" class="btn btn-primary self-start" :disabled="busy">{{ busy ? 'Starting…' : 'Start exercise' }}</button>
          <p v-if="message" role="status" class="m-0 text-[13px] text-bad">{{ message }}</p>
        </form>
      </section>
      <section class="bay overflow-hidden" aria-labelledby="list-h">
        <h2 id="list-h" class="border-b border-line px-5 py-4 text-[19px]">Your exercises</h2>
        <ul v-if="exercises?.length" class="m-0 list-none p-0" aria-label="Practice exercises">
          <li v-for="x in exercises" :key="x.id" class="border-b border-line last:border-b-0">
            <NuxtLink :to="`/academy/practice/${x.id}`" class="motion grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-ink no-underline hover:bg-raised/50">
              <span class="flex min-w-0 items-start gap-3">
                <FragranceImage v-if="x.fragrance" :image-id="x.primary_image_id" :alt="`${x.brand} ${x.fragrance}`" size="thumb" />
                <span class="min-w-0">
                <span class="block text-[15px] font-medium [overflow-wrap:anywhere]">{{ x.title }}</span>
                <span class="mt-0.5 block text-[13px] text-ink-3">{{ x.fragrance ? `${x.fragrance} · ${x.brand}` : 'Generic blotter' }} · {{ when(x.created_at) }}</span>
                </span>
              </span>
              <span class="flex items-center gap-4">
                <span class="readout text-[12px] text-ink-3" :aria-label="`${x.observations ?? 0} of 3 observations`">{{ x.observations ?? 0 }}/3</span>
                <span class="w-20 text-right text-[12px]" :class="x.status === 'completed' ? 'text-ink' : 'text-ink-2'">{{ STATUS_LABEL[x.status] }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else-if="exercises" class="m-0 px-5 py-8 text-ink-2">No exercises yet. Start one with a blotter and a few minutes.</p>
        <div v-else class="h-40 animate-pulse" aria-busy="true" aria-label="Loading exercises" />
      </section>
    </div>
  </div>
</template>
