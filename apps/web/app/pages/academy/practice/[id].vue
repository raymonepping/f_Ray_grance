<script setup lang="ts">
// One blotter exercise: three observation stages with adjustable elapsed minutes. Saving is
// allowed while active; pause to stop, resume to continue. Nothing is timed or scored.
import { STAGES, type Exercise, type Observation, type Stage } from '~~/shared/academy';

const route = useRoute();
const id = computed(() => String(route.params.id));
const exercise = ref<Exercise | null>(null);
const error = ref<{ code: string; message: string } | null>(null);
interface Draft { minutes: number; descriptors: string; text: string; saved: boolean; message: string; busy: boolean }
const drafts = reactive<Record<Stage, Draft>>({
  initial: { minutes: 0, descriptors: '', text: '', saved: false, message: '', busy: false },
  twenty: { minutes: 20, descriptors: '', text: '', saved: false, message: '', busy: false },
  sixty: { minutes: 60, descriptors: '', text: '', saved: false, message: '', busy: false },
});
const statusMessage = ref('');

async function load() {
  error.value = null;
  try {
    const r = await apiFetch<{ exercise: Exercise; observations: Observation[] }>(`/api/v1/academy/practice/${id.value}`);
    exercise.value = r.exercise;
    for (const o of r.observations) Object.assign(drafts[o.stage], { minutes: o.elapsed_minutes, descriptors: o.descriptors.join(', '), text: o.free_text, saved: true });
    usePageHeader({ title: r.exercise.title, crumbs: [{ label: 'Academy', to: '/academy' }, { label: 'Train My Nose', to: '/academy/practice' }, { label: r.exercise.title }] });
    useHead({ title: `${r.exercise.title} · Train My Nose` });
  } catch (e) {
    error.value = e instanceof ApiFailure ? { code: e.code, message: e.message } : { code: 'INTERNAL', message: 'Could not load' };
  }
}
watch(id, load, { immediate: true });
usePageHeader({ title: 'Exercise', crumbs: [{ label: 'Academy', to: '/academy' }, { label: 'Train My Nose', to: '/academy/practice' }, { label: 'Exercise' }] });

const active = computed(() => exercise.value?.status === 'active');
const savedCount = computed(() => STAGES.filter((s) => drafts[s.key].saved).length);

async function save(stage: Stage) {
  const d = drafts[stage];
  d.busy = true;
  d.message = '';
  try {
    const descriptors = d.descriptors.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20);
    await apiFetch(`/api/v1/academy/practice/${id.value}/observations/${stage}`, { method: 'PUT', body: { elapsedMinutes: Math.max(0, Math.min(1440, Math.round(d.minutes || 0))), descriptors, text: d.text } });
    d.saved = true;
    d.message = 'Observation saved.';
  } catch (e) {
    d.message = e instanceof ApiFailure ? `Not saved: ${e.message}. Your text is kept.` : 'Not saved. Your text is kept.';
  } finally {
    d.busy = false;
  }
}
async function setStatus(status: Exercise['status']) {
  statusMessage.value = '';
  try {
    await apiFetch(`/api/v1/academy/practice/${id.value}`, { method: 'PATCH', body: { status } });
    exercise.value = { ...exercise.value!, status };
    statusMessage.value = status === 'paused' ? 'Paused. Resume any time.' : status === 'completed' ? 'Exercise completed.' : 'Resumed.';
  } catch (e) {
    statusMessage.value = e instanceof ApiFailure ? e.message : 'Status not changed.';
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <EmptyState v-if="error?.code === 'NOT_FOUND' || error?.code === 'VALIDATION_FAILED'" icon="academy" title="Exercise not found" body="This practice exercise does not exist or is not yours." action-label="Back to Train My Nose" action-to="/academy/practice" />
    <StatusBanner v-else-if="error" tone="error" title="Exercise unavailable">{{ error.message }} <button type="button" class="underline" @click="load">Retry</button></StatusBanner>
    <template v-else-if="exercise">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="[overflow-wrap:anywhere]">{{ exercise.title }}</h1>
          <p class="m-0 mt-2 text-[14px] text-ink-2">
            <span class="readout">{{ savedCount }}/3</span> observations ·
            <span data-testid="exercise-status">{{ exercise.status === 'active' ? 'Active' : exercise.status === 'paused' ? 'Paused' : 'Completed' }}</span>
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button v-if="exercise.status === 'active'" type="button" class="btn btn-quiet" @click="setStatus('paused')">Pause</button>
          <button v-else type="button" class="btn btn-quiet" @click="setStatus('active')">{{ exercise.status === 'completed' ? 'Reopen' : 'Resume' }}</button>
          <button v-if="exercise.status !== 'completed'" type="button" class="btn btn-primary" @click="setStatus('completed')">Complete</button>
        </div>
      </div>
      <p v-if="statusMessage" role="status" class="m-0 text-[13px] text-ink-2">{{ statusMessage }}</p>
      <StatusBanner v-if="!active" tone="info" :title="exercise.status === 'paused' ? 'Paused' : 'Completed'">Observations are read-only. {{ exercise.status === 'paused' ? 'Resume' : 'Reopen' }} the exercise to add or change them.</StatusBanner>

      <ol class="m-0 grid list-none gap-5 p-0 lg:grid-cols-3">
        <li v-for="(s, i) in STAGES" :key="s.key">
          <form class="bay flex h-full flex-col gap-4 p-5" :aria-label="`${s.label} observation`" @submit.prevent="save(s.key)">
            <div class="flex items-start justify-between gap-3">
              <h2 class="text-[19px]">{{ s.label }}</h2>
              <span class="readout grid size-7 place-items-center rounded-full border text-[11px]" :class="drafts[s.key].saved ? 'border-ink bg-ink text-canvas' : 'border-line-strong text-ink-3'" aria-hidden="true">
                <AppIcon v-if="drafts[s.key].saved" name="check" :size="13" /><template v-else>{{ i + 1 }}</template>
              </span>
            </div>
            <p class="m-0 text-[14px] text-ink-2">{{ s.prompt }}</p>
            <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="!active">
              <div class="flex flex-col gap-1.5">
                <label :for="`min-${s.key}`" class="text-[13px] font-medium text-ink-2">Elapsed minutes</label>
                <input :id="`min-${s.key}`" v-model.number="drafts[s.key].minutes" type="number" min="0" max="1440" inputmode="numeric" class="field readout w-28" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label :for="`desc-${s.key}`" class="text-[13px] font-medium text-ink-2">Descriptors <span class="font-normal text-ink-3">(comma separated)</span></label>
                <input :id="`desc-${s.key}`" v-model="drafts[s.key].descriptors" maxlength="1200" class="field" placeholder="e.g. bright, peppery, airy" />
              </div>
              <div class="flex flex-col gap-1.5">
                <label :for="`text-${s.key}`" class="text-[13px] font-medium text-ink-2">What you notice <span class="font-normal text-ink-3">(private)</span></label>
                <textarea :id="`text-${s.key}`" v-model="drafts[s.key].text" maxlength="4000" rows="4" class="field" />
              </div>
            </fieldset>
            <div class="mt-auto flex items-center justify-between gap-3">
              <button type="submit" class="btn btn-quiet" :disabled="!active || drafts[s.key].busy">{{ drafts[s.key].busy ? 'Saving…' : 'Save observation' }}</button>
              <p v-if="drafts[s.key].message" role="status" class="m-0 text-[12px]" :class="drafts[s.key].message.startsWith('Not') ? 'text-bad' : 'text-ink-2'">{{ drafts[s.key].message }}</p>
            </div>
          </form>
        </li>
      </ol>
      <p class="m-0 text-[12px] text-ink-3">Times are prompts, not deadlines: adjust the minutes to what actually happened. Unfamiliar impressions are valid observations.</p>
    </template>
    <div v-else class="bay h-80 animate-pulse" aria-busy="true" aria-label="Loading exercise" />
  </div>
</template>
