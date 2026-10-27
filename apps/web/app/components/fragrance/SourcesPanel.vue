<script setup lang="ts">
// Fragrance sources in order (ADR-021): Scento, NoteboxD, ScentRev, web research. NoteboxD fills
// gaps only: you start a check, it must find exactly this fragrance, and you choose which details to
// keep. Kept values are labelled NoteboxD and never replace Scento, official or your own data.
const props = defineProps<{ fragranceId: string }>();
const emit = defineEmits<{ saved: [] }>();

type Field = 'concentration' | 'launch_year' | 'pyramid' | 'listed_notes';
interface Proposal { field: Field; display: string; note: string | null; acceptable: boolean; fillsGap: boolean }
interface Finding { id: string; pageUrl: string; siteName: string; productNameOnPage: string; rejected: string | null; proposals: Proposal[] }
interface Source { key: string; label: string; role: string; enabled?: boolean; remainingToday?: number }
interface Status { order: Source[]; noteboxd: { enabled: boolean; missing: Field[] } }
interface Check { available: boolean; message?: string; fromCache?: boolean; remainingToday?: number; finding: Finding | null; candidates?: { name: string; brand: string }[] }

const LABEL: Record<Field, string> = { concentration: 'Concentration', launch_year: 'Launch year', pyramid: 'Note pyramid', listed_notes: 'Listed notes' };
const status = ref<Status | null>(null);
const result = ref<Check | null>(null);
const picked = ref<Field[]>([]);
const running = ref(false);
const saving = ref(false);
const message = ref('');
const saved = ref<Field[]>([]);

async function load() {
  try {
    status.value = await apiFetch<Status>(`/api/v1/fragrances/${props.fragranceId}/sources`);
  } catch {
    status.value = null;
  }
}
watch(() => props.fragranceId, load, { immediate: true });
const noteboxd = computed(() => status.value?.order.find((s) => s.key === 'noteboxd'));

async function check() {
  running.value = true;
  message.value = '';
  result.value = null;
  saved.value = [];
  try {
    const r = await apiFetch<Check>(`/api/v1/fragrances/${props.fragranceId}/sources/noteboxd/check`, { method: 'POST' });
    result.value = r;
    picked.value = r.finding?.proposals.filter((p) => p.acceptable).map((p) => p.field) ?? [];
    if (!r.available || !r.finding) message.value = r.message ?? 'NoteboxD has nothing to add.';
    await load();
  } catch (e) {
    message.value = e instanceof ApiFailure && e.code === 'RATE_LIMITED' ? 'Check limit reached (6 per 10 minutes). Try again later.' : e instanceof ApiFailure ? e.message : 'The NoteboxD check failed.';
  } finally {
    running.value = false;
  }
}

async function save() {
  const f = result.value?.finding;
  if (!f) return;
  saving.value = true;
  message.value = '';
  try {
    const r = await apiFetch<{ saved: number; fields: Field[] }>(`/api/v1/fragrances/${props.fragranceId}/sources/noteboxd/${f.id}/accept`, { method: 'POST', body: { fields: picked.value } });
    saved.value = [...saved.value, ...r.fields];
    for (const p of f.proposals) if (r.fields.includes(p.field)) p.acceptable = false;
    picked.value = picked.value.filter((x) => !r.fields.includes(x));
    message.value = `Saved from NoteboxD: ${r.fields.map((x) => LABEL[x]).join(', ')}. It now shows on this page, labelled NoteboxD.`;
    await load();
    emit('saved');
  } catch (e) {
    message.value = e instanceof ApiFailure ? `Not saved: ${e.message}` : 'Not saved.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section v-if="status" class="bay flex flex-col gap-4 p-5" aria-labelledby="sources-h" data-testid="sources-panel">
    <h2 id="sources-h">Fragrance sources</h2>
    <ol class="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]" aria-label="Sources in order of trust">
      <li v-for="(s, i) in status.order" :key="s.key" class="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
        <span class="readout text-ink-3">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="min-w-0">
          <span class="font-medium text-ink">{{ s.label }}</span>
          <span class="text-ink-2"> · {{ s.role }}</span>
        </span>
      </li>
    </ol>
    <p class="m-0 text-[12px] text-ink-3">A source higher in the list always wins. Lower sources only fill details the ones above do not have.</p>

    <div class="flex flex-col gap-3 border-t border-line pt-4">
      <h3 class="m-0 text-[15px]">NoteboxD</h3>
      <p v-if="!status.noteboxd.enabled" class="m-0 text-[13px] text-ink-3">Off: no NoteboxD key is stored in Vault. Add one with <code class="readout">make noteboxd-key</code>.</p>
      <template v-else>
        <p class="m-0 text-[13px]">
          <span class="text-ink-3">NoteboxD could fill:</span>
          <template v-if="status.noteboxd.missing.length"> {{ status.noteboxd.missing.map((m) => LABEL[m]).join(', ') }}</template>
          <template v-else> nothing; Scento or your own data already cover it.</template>
        </p>
        <button type="button" class="btn btn-quiet self-start" :disabled="running || !status.noteboxd.missing.length" @click="check">
          {{ running ? 'Checking NoteboxD…' : 'Check NoteboxD' }}
        </button>
        <p class="m-0 text-[11px] text-ink-3">
          Sends only the brand and name. Uses at most two calls, none if checked in the last 24 hours<template v-if="noteboxd?.remainingToday !== undefined"> · <span class="readout">{{ noteboxd.remainingToday }}</span> calls left today</template>.
        </p>
      </template>
      <p v-if="message" role="status" class="m-0 text-[13px] text-ink-2">{{ message }}</p>
      <ul v-if="result?.candidates?.length" class="m-0 list-none p-0 text-[13px] text-ink-2" aria-label="NoteboxD candidates (not chosen)">
        <li v-for="c in result.candidates" :key="`${c.brand}-${c.name}`">{{ c.name }} <span class="text-ink-3">{{ c.brand }}</span></li>
      </ul>

      <article v-if="result?.finding" class="flex flex-col gap-3 rounded-control border border-line p-4" aria-label="Details from NoteboxD">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <a :href="result.finding.pageUrl" target="_blank" rel="noopener noreferrer" class="text-[14px] font-medium">NoteboxD<span class="sr-only"> (opens in a new tab)</span></a>
          <span class="text-[12px] text-ink-3">Entry: {{ result.finding.productNameOnPage }}<template v-if="result.fromCache"> · checked earlier today</template></span>
        </div>
        <p v-if="result.finding.rejected" class="m-0 text-[13px] text-warn">{{ result.finding.rejected }}</p>
        <fieldset v-if="result.finding.proposals.length" class="m-0 flex flex-col gap-2 border-0 p-0">
          <legend class="sr-only">Details proposed by NoteboxD</legend>
          <label v-for="p in result.finding.proposals" :key="p.field" class="flex items-start gap-2.5 text-[13px]" :class="p.acceptable ? '' : 'text-ink-3'">
            <input v-model="picked" type="checkbox" :value="p.field" :disabled="!p.acceptable" class="mt-0.5 size-4 accent-[var(--action)]" />
            <span class="min-w-0">
              <span class="font-medium text-ink">{{ LABEL[p.field] }}</span>
              <span v-if="saved.includes(p.field)" class="ml-1.5 inline-flex items-center gap-1 rounded-[4px] border border-line-strong px-1 text-[11px] text-ink" data-testid="noteboxd-saved"><AppIcon name="check" :size="11" /> Saved</span>
              <span v-else-if="p.fillsGap" class="ml-1.5 rounded-[4px] border border-line px-1 text-[11px] text-ink-3">fills a gap</span>
              <span class="block text-ink-2 [overflow-wrap:anywhere]">{{ p.display }}</span>
              <span v-if="p.note" class="block text-[12px] text-ink-3">{{ p.note }}</span>
            </span>
          </label>
        </fieldset>
        <button v-if="result.finding.proposals.some((p) => p.acceptable)" type="button" class="btn btn-quiet self-start" :disabled="saving || !picked.length" @click="save">
          {{ saving ? 'Saving…' : 'Save selected from NoteboxD' }}
        </button>
      </article>
    </div>
  </section>
</template>
