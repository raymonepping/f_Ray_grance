<script setup lang="ts">
// Rating (separate from ownership) and private note. Server-acknowledged saves only;
// a failed save keeps the typed draft visible with a retry (DESIGN §12.1).
import type { CollectionEntry } from '~~/shared/types';

const props = defineProps<{ entry: CollectionEntry }>();
const emit = defineEmits<{ updated: [CollectionEntry] }>();
const rating = ref<number | null>(props.entry.rating);
const note = ref(props.entry.personal_note ?? '');
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const message = ref('');
const dirty = computed(() => rating.value !== props.entry.rating || note.value !== (props.entry.personal_note ?? ''));
watch(
  () => props.entry,
  (e, previous) => {
    if (status.value !== 'error') {
      if (rating.value === previous.rating) rating.value = e.rating;
      if (note.value === (previous.personal_note ?? '')) note.value = e.personal_note ?? '';
    }
  },
);
async function save() {
  status.value = 'saving';
  try {
    const r = await apiFetch<{ entry: CollectionEntry; history: CollectionEntry['history'] }>(`/api/v1/collection/${props.entry.id}`, {
      method: 'PATCH',
      body: { rating: rating.value, personalNote: note.value.trim() ? note.value : null },
    });
    emit('updated', { ...r.entry, history: r.history });
    status.value = 'saved';
    message.value = 'Saved.';
  } catch (e) {
    status.value = 'error';
    message.value = e instanceof ApiFailure ? `Not saved — ${e.message}. Your text is kept; try again.` : 'Not saved. Your text is kept; try again.';
  }
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="save">
    <fieldset class="m-0 border-0 p-0">
      <legend class="mb-2 text-sm font-semibold">Your rating <span class="font-normal text-ink-3">(independent of ownership)</span></legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="n in [1, 2, 3, 4, 5]" :key="n" class="tap motion flex cursor-pointer items-center justify-center rounded-control border px-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus-ring)]" :class="rating === n ? 'border-gold bg-sunken font-semibold' : 'border-line text-ink-2'">
          <input v-model="rating" class="sr-only" type="radio" :name="`rating-${entry.id}`" :value="n" />
          {{ n }}<span class="sr-only"> out of 5</span>
        </label>
        <label class="tap motion flex cursor-pointer items-center rounded-control border px-3 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus-ring)]" :class="rating === null ? 'border-gold bg-sunken font-semibold' : 'border-line text-ink-2'">
          <input v-model="rating" class="sr-only" type="radio" :name="`rating-${entry.id}`" :value="null" /> No rating
        </label>
      </div>
    </fieldset>
    <label :for="`note-${entry.id}`" class="text-sm font-semibold">Private note <span class="font-normal text-ink-3">(stays on your Mac; never sent to Scento)</span></label>
    <textarea :id="`note-${entry.id}`" v-model="note" rows="3" maxlength="4000" class="rounded-control border border-line bg-sunken p-3 text-ink" />
    <div class="flex items-center gap-3">
      <button type="submit" :disabled="!dirty || status === 'saving'" class="tap rounded-control bg-gold px-4 font-semibold text-gold-ink disabled:opacity-50">{{ status === 'saving' ? 'Saving…' : 'Save' }}</button>
      <p v-if="message" role="status" class="m-0 text-sm" :class="status === 'error' ? 'text-bad' : 'text-ok'">{{ message }}</p>
    </div>
  </form>
</template>
