<script setup lang="ts">
// Web research (ADR-013): fills details Scento does not provide. You start it, it reads up to two
// pages that name exactly this fragrance, and you choose which proposals to keep. Kept values are
// labelled "Web research" and never override Scento, official or your own data.
const props = defineProps<{ fragranceId: string }>();
const emit = defineEmits<{ saved: [] }>();

type Field = 'concentration' | 'launch_year' | 'pyramid' | 'listed_notes';
interface Proposal { field: Field; display: string; note: string | null; acceptable: boolean; fillsGap: boolean }
interface Finding { id: string; pageUrl: string; siteName: string; productNameOnPage: string; evidence: string | null; rejected: string | null; proposals: Proposal[] }

const LABEL: Record<Field, string> = { concentration: 'Concentration', launch_year: 'Launch year', pyramid: 'Note pyramid', listed_notes: 'Listed notes' };
const status = ref<{ enabled: boolean; missing: Field[] } | null>(null);
const findings = ref<Finding[] | null>(null);
const picked = reactive<Record<string, Field[]>>({});
const running = ref(false);
const message = ref('');
const saving = ref<string | null>(null);

async function load() {
  try {
    status.value = await apiFetch(`/api/v1/fragrances/${props.fragranceId}/research`);
  } catch {
    status.value = null;
  }
}
watch(() => props.fragranceId, load, { immediate: true });

async function run() {
  running.value = true;
  message.value = '';
  findings.value = null;
  try {
    // Starts a background job, then polls it (a run reads up to two pages and can take minutes).
    const start = await apiFetch<{ jobId: string }>(`/api/v1/fragrances/${props.fragranceId}/research`, { method: 'POST' });
    let r: { status: string; available?: boolean; message?: string; findings?: Finding[] } = { status: 'running' };
    for (let i = 0; i < 100 && r.status === 'running'; i++) {
      await new Promise((res) => setTimeout(res, 3000));
      r = await apiFetch(`/api/v1/fragrances/${props.fragranceId}/research/jobs/${start.jobId}`);
    }
    if (r.status === 'running') throw new Error('timeout');
    r.findings ??= [];
    if (!r.available) message.value = r.message ?? 'Web research is unavailable right now.';
    else if (!r.findings.length) message.value = r.message ?? 'Nothing found.';
    findings.value = r.findings;
    for (const f of r.findings!) picked[f.id] = f.proposals.filter((p) => p.acceptable && p.fillsGap).map((p) => p.field);
  } catch (e) {
    message.value = (e as Error).message === 'timeout' ? 'Research is taking unusually long; try again later.' : e instanceof ApiFailure && e.code === 'RATE_LIMITED' ? 'Research limit reached (3 runs per 10 minutes). Try again later.' : e instanceof ApiFailure ? e.message : 'Research failed.';
  } finally {
    running.value = false;
  }
}

async function save(f: Finding) {
  saving.value = f.id;
  message.value = '';
  try {
    const r = await apiFetch<{ saved: number }>(`/api/v1/fragrances/${props.fragranceId}/research/${f.id}/accept`, { method: 'POST', body: { fields: picked[f.id] } });
    message.value = `Saved ${r.saved} detail${r.saved === 1 ? '' : 's'} as web research from ${f.siteName}.`;
    await load();
    emit('saved');
  } catch (e) {
    message.value = e instanceof ApiFailure ? `Not saved: ${e.message}` : 'Not saved.';
  } finally {
    saving.value = null;
  }
}
</script>

<template>
  <section v-if="status" class="bay flex flex-col gap-4 p-5" aria-labelledby="research-h" data-testid="research-panel">
    <div class="flex items-start justify-between gap-3">
      <h2 id="research-h">Web research</h2>
      <span class="rounded-[4px] border border-line px-1.5 py-0.5 text-[11px] text-ink-3">Lower trust</span>
    </div>
    <p class="m-0 text-[13px] text-ink-2">
      Fills details Scento does not list, from pages that name exactly this fragrance. You review every value; saved values are labelled “Web research” and never replace Scento or your own data.
    </p>
    <template v-if="!status.enabled">
      <p class="m-0 text-[13px] text-ink-3">Off: no TinyFish key is stored in Vault. Add one with <code class="readout">make tinyfish-key</code>.</p>
    </template>
    <template v-else>
      <p class="m-0 text-[13px]">
        <span class="text-ink-3">Missing:</span>
        <template v-if="status.missing.length"> {{ status.missing.map((m) => LABEL[m]).join(', ') }}</template>
        <template v-else> nothing; research can still find corroborating sources.</template>
      </p>
      <button type="button" class="btn btn-quiet self-start" :disabled="running" @click="run">
        {{ running ? 'Researching… (usually one to two minutes)' : 'Research missing details' }}
      </button>
      <p class="m-0 text-[11px] text-ink-3">Sends only the brand, name and concentration to TinyFish. Each run reads up to two pages and may use TinyFish credits.</p>
    </template>
    <p v-if="message" role="status" class="m-0 text-[13px] text-ink-2">{{ message }}</p>

    <article v-for="f in findings ?? []" :key="f.id" class="flex flex-col gap-3 rounded-control border border-line p-4" :aria-label="`Research from ${f.siteName}`">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <a :href="f.pageUrl" target="_blank" rel="noopener noreferrer" class="text-[14px] font-medium">{{ f.siteName }}<span class="sr-only"> (opens in a new tab)</span></a>
        <span v-if="f.productNameOnPage" class="text-[12px] text-ink-3">Page names: {{ f.productNameOnPage }}</span>
      </div>
      <p v-if="f.rejected" class="m-0 text-[13px] text-warn">{{ f.rejected }}</p>
      <fieldset v-if="f.proposals.length" class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="sr-only">Details proposed by {{ f.siteName }}</legend>
        <label v-for="p in f.proposals" :key="p.field" class="flex items-start gap-2.5 text-[13px]" :class="p.acceptable ? '' : 'text-ink-3'">
          <input v-model="picked[f.id]" type="checkbox" :value="p.field" :disabled="!p.acceptable" class="mt-0.5 size-4 accent-[var(--action)]" />
          <span class="min-w-0">
            <span class="font-medium text-ink">{{ LABEL[p.field] }}</span>
            <span v-if="p.fillsGap" class="ml-1.5 rounded-[4px] border border-line px-1 text-[11px] text-ink-3">fills a gap</span>
            <span class="block text-ink-2 [overflow-wrap:anywhere]">{{ p.display }}</span>
            <span v-if="p.note" class="block text-[12px] text-warn">{{ p.note }}</span>
          </span>
        </label>
      </fieldset>
      <blockquote v-if="f.evidence" class="m-0 border-l-2 border-line-strong pl-3 text-[12px] text-ink-3">“{{ f.evidence }}”</blockquote>
      <button v-if="f.proposals.some((p) => p.acceptable)" type="button" class="btn btn-quiet self-start" :disabled="saving === f.id || !picked[f.id]?.length" @click="save(f)">
        {{ saving === f.id ? 'Saving…' : 'Save selected as web research' }}
      </button>
    </article>
  </section>
</template>
