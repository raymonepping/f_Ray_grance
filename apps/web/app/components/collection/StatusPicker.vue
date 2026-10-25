<script setup lang="ts">
// Reversible status change with history (DESIGN §7 CollectionStatusPicker). Never says
// "Saved" before the server acknowledges; on failure the previous status is restored.
import { STATE_LABEL, STATES, type CollectionEntry, type CollectionState } from '~~/shared/types';

const props = defineProps<{ entry: CollectionEntry }>();
const emit = defineEmits<{ updated: [CollectionEntry] }>();
const pending = ref<CollectionState | null>(null);
const reason = ref('');
const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const message = ref('');
const groupName = `state-${props.entry.id}`;

async function save() {
  if (!pending.value || pending.value === props.entry.state) return;
  status.value = 'saving';
  try {
    const r = await apiFetch<{ entry: CollectionEntry; history: CollectionEntry['history'] }>(`/api/v1/collection/${props.entry.id}`, {
      method: 'PATCH',
      body: { state: pending.value, reason: reason.value.trim() || null },
    });
    emit('updated', { ...r.entry, history: r.history });
    status.value = 'saved';
    message.value = `Saved: now ${STATE_LABEL[r.entry.state]}.`;
    pending.value = null;
    reason.value = '';
  } catch (e) {
    status.value = 'error';
    message.value = e instanceof ApiFailure ? `Not saved — ${e.message}` : 'Not saved.';
  }
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="save">
    <fieldset class="m-0 border-0 p-0">
      <legend class="mb-2 text-sm font-semibold">Status</legend>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="s in STATES"
          :key="s"
          class="tap motion flex cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus-ring)]"
          :class="(pending ?? entry.state) === s ? 'border-gold bg-sunken font-semibold' : 'border-line text-ink-2'"
        >
          <input v-model="pending" class="sr-only" type="radio" :name="groupName" :value="s" :checked="(pending ?? entry.state) === s" />
          {{ STATE_LABEL[s] }}<span v-if="entry.state === s" class="text-xs text-ink-3">(current)</span>
        </label>
      </div>
    </fieldset>
    <div v-if="pending && pending !== entry.state" class="flex flex-col gap-2">
      <label :for="`reason-${entry.id}`" class="text-sm font-semibold">Why? <span class="font-normal text-ink-3">(optional, kept in history)</span></label>
      <input :id="`reason-${entry.id}`" v-model="reason" maxlength="1000" class="tap rounded-control border border-line bg-sunken px-3 text-ink" placeholder="e.g. bought a full bottle" />
      <div class="flex gap-2">
        <button type="submit" :disabled="status === 'saving'" class="tap rounded-control bg-gold px-4 font-semibold text-gold-ink disabled:opacity-60">
          {{ status === 'saving' ? 'Saving…' : `Change to ${STATE_LABEL[pending]}` }}
        </button>
        <button type="button" class="tap rounded-control border border-line px-4" @click="pending = null">Cancel</button>
      </div>
    </div>
    <p v-if="message" role="status" class="m-0 text-sm" :class="status === 'error' ? 'text-bad' : 'text-ok'">{{ message }}</p>
  </form>
</template>
