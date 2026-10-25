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
    message.value = e instanceof ApiFailure ? `Not saved: ${e.message}` : 'Not saved.';
  }
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="save">
    <fieldset class="m-0 border-0 p-0">
      <legend class="mb-2 text-[13px] font-medium text-ink-2">Status</legend>
      <div class="flex w-fit max-w-full flex-wrap gap-1 rounded-control border border-line bg-sunken p-1">
        <label
          v-for="s in STATES"
          :key="s"
          class="motion flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-3 text-[14px] pointer-coarse:h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]"
          :class="(pending ?? entry.state) === s ? 'bg-raised font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink'"
        >
          <input v-model="pending" class="sr-only" type="radio" :name="groupName" :value="s" :checked="(pending ?? entry.state) === s" />
          {{ STATE_LABEL[s] }}<span v-if="entry.state === s" class="text-[12px] text-ink-3">(current)</span>
        </label>
      </div>
    </fieldset>
    <div v-if="pending && pending !== entry.state" class="flex flex-col gap-2">
      <label :for="`reason-${entry.id}`" class="text-[13px] font-medium text-ink-2">Why? <span class="font-normal text-ink-3">(optional, kept in history)</span></label>
      <input :id="`reason-${entry.id}`" v-model="reason" maxlength="1000" class="field" placeholder="e.g. bought a full bottle" />
      <div class="flex gap-2">
        <button type="submit" :disabled="status === 'saving'" class="btn btn-primary">
          {{ status === 'saving' ? 'Saving…' : `Change to ${STATE_LABEL[pending]}` }}
        </button>
        <button type="button" class="btn btn-quiet" @click="pending = null">Cancel</button>
      </div>
    </div>
    <p v-if="message" role="status" class="m-0 text-[14px]" :class="status === 'error' ? 'text-bad' : 'text-ink-2'">{{ message }}</p>
  </form>
</template>
