<script setup lang="ts">
// Fragrance sources in order (ADR-021, ADR-022): Scento, NoteboxD, ScentRev, Fragella, web research.
// The sources after Scento fill gaps only: you start a check, it must find exactly this fragrance,
// and you choose which details to keep. Fragella is the last resort (20 calls per month): the server
// allows it only after NoteboxD was tried. Kept values are labelled with their source.
const props = defineProps<{ fragranceId: string }>();
const emit = defineEmits<{ saved: [] }>();

type Field = 'concentration' | 'launch_year' | 'pyramid' | 'listed_notes';
type Key = 'noteboxd' | 'fragella';
interface Proposal { field: Field; display: string; note: string | null; acceptable: boolean; fillsGap: boolean }
interface Finding { id: string; pageUrl: string; siteName: string; productNameOnPage: string; rejected: string | null; proposals: Proposal[] }
interface Source { key: string; label: string; role: string; enabled?: boolean; remainingToday?: number; remainingThisMonth?: number | null }
interface Status {
  order: Source[];
  noteboxd: { enabled: boolean; missing: Field[] };
  fragella: { enabled: boolean; missing: Field[]; blockedBy: string | null; remainingThisMonth: number | null };
}
interface Check { available: boolean; message?: string; fromCache?: boolean; finding: Finding | null; candidates?: { name: string; brand: string }[] }

const LABEL: Record<Field, string> = { concentration: 'Concentration', launch_year: 'Launch year', pyramid: 'Note pyramid', listed_notes: 'Listed notes' };
const NAME: Record<Key, string> = { noteboxd: 'NoteboxD', fragella: 'Fragella' };
const status = ref<Status | null>(null);
const result = reactive<Record<Key, Check | null>>({ noteboxd: null, fragella: null });
const picked = reactive<Record<Key, Field[]>>({ noteboxd: [], fragella: [] });
const saved = reactive<Record<Key, Field[]>>({ noteboxd: [], fragella: [] });
const message = reactive<Record<Key, string>>({ noteboxd: '', fragella: '' });
const busy = ref<Key | null>(null);

async function load() {
  try {
    status.value = await apiFetch<Status>(`/api/v1/fragrances/${props.fragranceId}/sources`);
  } catch {
    status.value = null;
  }
}
watch(() => props.fragranceId, load, { immediate: true });
const sourceInfo = (k: Key) => status.value?.order.find((s) => s.key === k);

async function check(k: Key) {
  busy.value = k;
  message[k] = '';
  result[k] = null;
  saved[k] = [];
  try {
    const r = await apiFetch<Check>(`/api/v1/fragrances/${props.fragranceId}/sources/${k}/check`, { method: 'POST' });
    result[k] = r;
    picked[k] = r.finding?.proposals.filter((p) => p.acceptable).map((p) => p.field) ?? [];
    if (!r.available || !r.finding) message[k] = r.message ?? `${NAME[k]} has nothing to add.`;
    await load();
  } catch (e) {
    message[k] = e instanceof ApiFailure && e.code === 'RATE_LIMITED' ? 'Check limit reached. Try again later.' : e instanceof ApiFailure ? e.message : `The ${NAME[k]} check failed.`;
  } finally {
    busy.value = null;
  }
}

async function save(k: Key) {
  const f = result[k]?.finding;
  if (!f) return;
  busy.value = k;
  message[k] = '';
  try {
    const r = await apiFetch<{ saved: number; fields: Field[] }>(`/api/v1/fragrances/${props.fragranceId}/sources/${k}/${f.id}/accept`, { method: 'POST', body: { fields: picked[k] } });
    saved[k] = [...saved[k], ...r.fields];
    for (const p of f.proposals) if (r.fields.includes(p.field)) p.acceptable = false;
    picked[k] = picked[k].filter((x) => !r.fields.includes(x));
    message[k] = `Saved from ${NAME[k]}: ${r.fields.map((x) => LABEL[x]).join(', ')}. It now shows on this page, labelled ${NAME[k]}.`;
    await load();
    emit('saved');
  } catch (e) {
    message[k] = e instanceof ApiFailure ? `Not saved: ${e.message}` : 'Not saved.';
  } finally {
    busy.value = null;
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

    <div v-for="k in (['noteboxd', 'fragella'] as const)" :key="k" class="flex flex-col gap-3 border-t border-line pt-4" :data-testid="`source-${k}`">
      <h3 class="m-0 text-[15px]">{{ NAME[k] }}<span v-if="k === 'fragella'" class="ml-2 text-[12px] font-normal text-ink-3">last resort</span></h3>
      <p v-if="!status[k].enabled" class="m-0 text-[13px] text-ink-3">Off: no {{ NAME[k] }} key is stored in Vault. Add one with <code class="readout">make {{ k }}-key</code>.</p>
      <template v-else>
        <p class="m-0 text-[13px]">
          <span class="text-ink-3">{{ NAME[k] }} could fill:</span>
          <template v-if="status[k].missing.length"> {{ status[k].missing.map((m) => LABEL[m]).join(', ') }}</template>
          <template v-else> nothing; the sources above already cover it.</template>
        </p>
        <p v-if="k === 'fragella' && status.fragella.blockedBy && status.fragella.missing.length" class="m-0 text-[13px] text-ink-2">{{ status.fragella.blockedBy }}</p>
        <button
          type="button"
          class="btn btn-quiet self-start"
          :disabled="busy !== null || !status[k].missing.length || (k === 'fragella' && !!status.fragella.blockedBy) || (k === 'fragella' && status.fragella.remainingThisMonth === 0)"
          @click="check(k)"
        >
          {{ busy === k ? `Checking ${NAME[k]}…` : `Check ${NAME[k]}` }}
        </button>
        <p class="m-0 text-[11px] text-ink-3">
          <template v-if="k === 'noteboxd'">
            Sends only the brand and name. At most two calls, none if checked in the last 24 hours<template v-if="sourceInfo('noteboxd')?.remainingToday !== undefined"> · <span class="readout">{{ sourceInfo('noteboxd')?.remainingToday }}</span> calls left today</template>.
          </template>
          <template v-else>
            Sends only the brand and name. One call of the monthly allowance, none if checked in the last 30 days<template v-if="status.fragella.remainingThisMonth !== null"> · <span class="readout">{{ status.fragella.remainingThisMonth }}</span> calls left this month (2 kept in reserve)</template>.
          </template>
        </p>
      </template>
      <p v-if="message[k]" role="status" class="m-0 text-[13px] text-ink-2">{{ message[k] }}</p>
      <ul v-if="result[k]?.candidates?.length" class="m-0 list-none p-0 text-[13px] text-ink-2" :aria-label="`${NAME[k]} candidates (not chosen)`">
        <li v-for="c in result[k]!.candidates" :key="`${c.brand}-${c.name}`">{{ c.name }} <span class="text-ink-3">{{ c.brand }}</span></li>
      </ul>

      <article v-if="result[k]?.finding" class="flex flex-col gap-3 rounded-control border border-line p-4" :aria-label="`Details from ${NAME[k]}`">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <a :href="result[k]!.finding!.pageUrl" target="_blank" rel="noopener noreferrer" class="text-[14px] font-medium">{{ NAME[k] }}<span class="sr-only"> (opens in a new tab)</span></a>
          <span class="text-[12px] text-ink-3">Entry: {{ result[k]!.finding!.productNameOnPage }}<template v-if="result[k]!.fromCache"> · checked earlier</template></span>
        </div>
        <p v-if="result[k]!.finding!.rejected" class="m-0 text-[13px] text-warn">{{ result[k]!.finding!.rejected }}</p>
        <fieldset v-if="result[k]!.finding!.proposals.length" class="m-0 flex flex-col gap-2 border-0 p-0">
          <legend class="sr-only">Details proposed by {{ NAME[k] }}</legend>
          <label v-for="p in result[k]!.finding!.proposals" :key="p.field" class="flex items-start gap-2.5 text-[13px]" :class="p.acceptable ? '' : 'text-ink-3'">
            <input v-model="picked[k]" type="checkbox" :value="p.field" :disabled="!p.acceptable" class="mt-0.5 size-4 accent-[var(--action)]" />
            <span class="min-w-0">
              <span class="font-medium text-ink">{{ LABEL[p.field] }}</span>
              <span v-if="saved[k].includes(p.field)" class="ml-1.5 inline-flex items-center gap-1 rounded-[4px] border border-line-strong px-1 text-[11px] text-ink" :data-testid="`${k}-saved`"><AppIcon name="check" :size="11" /> Saved</span>
              <span v-else-if="p.fillsGap" class="ml-1.5 rounded-[4px] border border-line px-1 text-[11px] text-ink-3">fills a gap</span>
              <span class="block text-ink-2 [overflow-wrap:anywhere]">{{ p.display }}</span>
              <span v-if="p.note" class="block text-[12px] text-ink-3">{{ p.note }}</span>
            </span>
          </label>
        </fieldset>
        <button v-if="result[k]!.finding!.proposals.some((p) => p.acceptable)" type="button" class="btn btn-quiet self-start" :disabled="busy !== null || !picked[k].length" @click="save(k)">
          {{ busy === k ? 'Saving…' : `Save selected from ${NAME[k]}` }}
        </button>
      </article>
    </div>
  </section>
</template>
