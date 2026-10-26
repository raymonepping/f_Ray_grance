<script setup lang="ts">
// Permanent removal of one collection entry: preview first (what goes, what stays), then an
// explicit "Remove permanently". Suggests "Previously owned" when history should be kept.
import type { CollectionEntry } from '~~/shared/types';
import { STATE_LABEL } from '~~/shared/types';

const props = defineProps<{ entry: CollectionEntry; name: string }>();
const emit = defineEmits<{ removed: [] }>();
interface Preview { state: keyof typeof STATE_LABEL; events: number; hasRating: boolean; hasNote: boolean; practice: number }
const preview = ref<Preview | null>(null);
const busy = ref(false);
const message = ref('');

async function open() {
  message.value = '';
  try {
    preview.value = await apiFetch<Preview>(`/api/v1/collection/${props.entry.id}/removal-preview`);
    await nextTick();
    document.getElementById(`remove-${props.entry.id}`)?.focus();
  } catch (e) {
    message.value = e instanceof ApiFailure ? e.message : 'Could not prepare the removal.';
  }
}
async function remove() {
  busy.value = true;
  try {
    await apiFetch(`/api/v1/collection/${props.entry.id}`, { method: 'DELETE', body: { confirm: 'REMOVE' } });
    preview.value = null;
    emit('removed');
  } catch (e) {
    message.value = e instanceof ApiFailure ? `Not removed: ${e.message}` : 'Not removed.';
  } finally {
    busy.value = false;
  }
}
const goes = computed(() => {
  const p = preview.value;
  if (!p) return [];
  return [
    `this ${STATE_LABEL[p.state].toLowerCase()} entry`,
    `its status history (${p.events} ${p.events === 1 ? 'change' : 'changes'})`,
    ...(p.hasRating ? ['your rating'] : []),
    ...(p.hasNote ? ['your private note'] : []),
  ];
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <button v-if="!preview" type="button" class="btn btn-ghost h-8 min-h-0 self-start px-2.5 text-[13px] text-ink-3 hover:text-bad" @click="open">Remove from collection…</button>
    <div v-else :id="`remove-${entry.id}`" tabindex="-1" role="group" :aria-label="`Remove ${name} from your collection`" class="flex flex-col gap-3 rounded-control border border-bad/60 p-3 focus:outline-none" data-testid="remove-preview">
      <p class="m-0 text-[14px] font-medium">Remove {{ name }} permanently?</p>
      <p class="m-0 text-[13px] text-ink-2">This deletes {{ goes.join(', ') }}. It cannot be undone, except by restoring a backup.</p>
      <p class="m-0 text-[13px] text-ink-2">
        Stays: the fragrance in your library, its images and season choices<template v-if="preview.practice">, and {{ preview.practice }} practice {{ preview.practice === 1 ? 'exercise' : 'exercises' }} (kept as generic blotter practice)</template>.
      </p>
      <p v-if="preview.state === 'owned'" class="m-0 text-[12px] text-ink-3">Sold it or gave it away? Choose “Previously owned” above instead to keep its history.</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-quiet text-bad" :disabled="busy" @click="remove">{{ busy ? 'Removing…' : 'Remove permanently' }}</button>
        <button type="button" class="btn btn-ghost" :disabled="busy" @click="preview = null">Cancel</button>
      </div>
    </div>
    <p v-if="message" role="status" class="m-0 text-[13px] text-bad">{{ message }}</p>
  </div>
</template>
