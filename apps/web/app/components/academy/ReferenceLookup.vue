<script setup lang="ts">
// On-demand Scento reference lookup. Only the public concept term leaves the Mac.
import type { ReferenceKind, ReferenceResult } from '~~/shared/academy';

const props = defineProps<{ kind: ReferenceKind; label: string; placeholder?: string; suggestions?: string[]; initial?: string; auto?: boolean }>();
defineEmits<{ pick: [term: string] }>();
const term = ref(props.initial ?? '');
const busy = ref(false);
const result = ref<ReferenceResult | null>(null);
const error = ref('');
const valid = (t: string) => /^[A-Za-z0-9 &'-]{1,80}$/.test(t);

async function lookup(t = term.value) {
  const q = t.trim();
  error.value = '';
  if (props.kind !== 'families' && !valid(q)) {
    error.value = 'Use letters, numbers, spaces, hyphens or apostrophes (up to 80).';
    return;
  }
  term.value = q;
  busy.value = true;
  try {
    const params = new URLSearchParams({ kind: props.kind });
    if (q) params.set('term', q);
    result.value = await apiFetch<ReferenceResult>(`/api/v1/academy/reference?${params}`);
  } catch (e) {
    result.value = null;
    error.value = e instanceof ApiFailure && e.code === 'RATE_LIMITED' ? 'Lookup limit reached for now. Try again in a minute.' : e instanceof ApiFailure ? e.message : 'Lookup failed.';
  } finally {
    busy.value = false;
  }
}
defineExpose({ lookup });
onMounted(() => {
  if (props.auto) void lookup(props.initial ?? '');
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <form v-if="kind !== 'families'" class="flex flex-col gap-2" @submit.prevent="lookup()">
      <label :for="`ref-${kind}`" class="text-[13px] font-medium text-ink-2">{{ label }}</label>
      <div class="flex gap-2">
        <input :id="`ref-${kind}`" v-model="term" type="search" maxlength="80" autocomplete="off" :placeholder="placeholder" class="field" />
        <button type="submit" class="btn btn-primary" :disabled="busy || !term.trim()">{{ busy ? 'Looking up…' : 'Look up' }}</button>
      </div>
      <ul v-if="suggestions?.length" class="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Suggestions">
        <li v-for="s in suggestions" :key="s">
          <button type="button" class="motion h-8 rounded-[6px] border border-line px-2.5 text-[13px] text-ink-2 hover:border-line-strong hover:text-ink pointer-coarse:h-11" @click="lookup(s)">{{ s }}</button>
        </li>
      </ul>
      <p class="m-0 text-[12px] text-ink-3">Only this term is sent to Scento. Your notes, collection and practice never leave your Mac.</p>
    </form>
    <p v-if="error" role="alert" class="m-0 text-[13px] text-bad">{{ error }}</p>
    <div v-if="busy && !result" class="bay h-40 animate-pulse" aria-busy="true" aria-label="Loading reference" />
    <template v-else-if="result">
      <AcademyReferenceFolio v-if="result.available" :folio="result.reference" @pick="(t) => $emit('pick', t)" />
      <StatusBanner v-else tone="warning" title="Reference unavailable">
        {{ result.message }}<template v-if="result.retryAfterSeconds"> Try again in about {{ result.retryAfterSeconds }} s.</template>
      </StatusBanner>
    </template>
  </div>
</template>
