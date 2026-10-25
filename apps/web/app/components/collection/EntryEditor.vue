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
    message.value = e instanceof ApiFailure ? `Not saved: ${e.message}. Your text is kept; try again.` : 'Not saved. Your text is kept; try again.';
  }
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="save">
    <fieldset class="m-0 border-0 p-0">
      <legend class="mb-2 text-[13px] font-medium text-ink-2">Your rating <span class="font-normal text-ink-3">(independent of ownership)</span></legend>
      <div class="flex w-fit max-w-full flex-wrap gap-1 rounded-control border border-line bg-sunken p-1">
        <label v-for="n in [1, 2, 3, 4, 5]" :key="n" class="motion flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-3 text-[14px] pointer-coarse:h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]" :class="[rating === n ? 'bg-raised font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink', 'readout w-10']">
          <input v-model="rating" class="sr-only" type="radio" :name="`rating-${entry.id}`" :value="n" />
          {{ n }}<span class="sr-only"> out of 5</span>
        </label>
        <label class="motion flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-3 text-[14px] pointer-coarse:h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]" :class="rating === null ? 'bg-raised font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink'">
          <input v-model="rating" class="sr-only" type="radio" :name="`rating-${entry.id}`" :value="null" /> No rating
        </label>
      </div>
    </fieldset>
    <label :for="`note-${entry.id}`" class="text-[13px] font-medium text-ink-2">Private note <span class="font-normal text-ink-3">(stays on your Mac; never sent to Scento)</span></label>
    <textarea :id="`note-${entry.id}`" v-model="note" rows="3" maxlength="4000" class="field" />
    <div class="flex items-center gap-3">
      <button type="submit" :disabled="!dirty || status === 'saving'" class="btn btn-quiet">{{ status === 'saving' ? 'Saving…' : 'Save' }}</button>
      <p v-if="message" role="status" class="m-0 text-[14px]" :class="status === 'error' ? 'text-bad' : 'text-ink-2'">{{ message }}</p>
    </div>
  </form>
</template>
