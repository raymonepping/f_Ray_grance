<script setup lang="ts">
// Add with an explicit status. One clientRequestId per attempt makes retries safe
// (the server returns the same entry instead of a duplicate).
import { STATE_LABEL, STATES, type CollectionEntry, type CollectionState } from '~~/shared/types';

const props = defineProps<{ fragranceId: string; label?: string }>();
const emit = defineEmits<{ added: [CollectionEntry] }>();
const state = ref<CollectionState>('owned');
const reason = ref('');
const requestId = ref(crypto.randomUUID());
const status = ref<'idle' | 'saving' | 'error'>('idle');
const message = ref('');
async function add() {
  status.value = 'saving';
  try {
    const r = await apiFetch<{ entry: CollectionEntry }>('/api/v1/collection', {
      method: 'POST',
      body: { clientRequestId: requestId.value, fragranceId: props.fragranceId, state: state.value, reason: reason.value.trim() || null },
    });
    emit('added', r.entry);
    requestId.value = crypto.randomUUID(); // next add is a new entry (e.g. a repeat purchase)
    reason.value = '';
    status.value = 'idle';
    message.value = `Added as ${STATE_LABEL[r.entry.state]}.`;
  } catch (e) {
    status.value = 'error'; // keep the same requestId: retrying cannot duplicate
    message.value = e instanceof ApiFailure ? `Not added — ${e.message}. Retry is safe.` : 'Not added. Retry is safe.';
  }
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="add">
    <label :for="`add-state-${fragranceId}`" class="text-sm font-semibold">{{ label ?? 'Add to collection as' }}</label>
    <select :id="`add-state-${fragranceId}`" v-model="state" class="tap rounded-control border border-line bg-sunken px-3 text-ink">
      <option v-for="s in STATES" :key="s" :value="s">{{ STATE_LABEL[s] }}</option>
    </select>
    <label :for="`add-reason-${fragranceId}`" class="text-sm font-semibold">Note for the history <span class="font-normal text-ink-3">(optional)</span></label>
    <input :id="`add-reason-${fragranceId}`" v-model="reason" maxlength="1000" class="tap rounded-control border border-line bg-sunken px-3 text-ink" placeholder="e.g. tester from the store" />
    <button type="submit" :disabled="status === 'saving'" class="tap w-fit rounded-control bg-gold px-5 font-semibold text-gold-ink disabled:opacity-60">{{ status === 'saving' ? 'Adding…' : 'Add to collection' }}</button>
    <p v-if="message" role="status" class="m-0 text-sm" :class="status === 'error' ? 'text-bad' : 'text-ok'">{{ message }}</p>
  </form>
</template>
