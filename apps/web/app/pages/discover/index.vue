<script setup lang="ts">
// Search → Verify (DESIGN §6.5): exact / needs review / unresolved / conflict are shown
// separately; enrichment only after the owner confirms an exact identity.
import { CONCENTRATION_LABEL, type Pyramid } from '~~/shared/types';

usePageHeader({ title: 'Discover' });
interface Candidate { providerId: string | null; name: string; house: string; sourceUrl: string; match: string; reason: string }
interface Resolution {
  state: 'exact' | 'candidate_needs_review' | 'unresolved' | 'conflict';
  errorCode?: string;
  reason: string;
  local?: { fragranceId?: string; fragrance_id?: string; identityStatus?: string };
  profile?: { providerId: string; name: string; house: string; concentration: string | null; concentrationRaw: string | null; family: string | null; subfamily: string | null; pyramid: Pyramid; listedNotes?: string[]; signatureMaterials?: string[]; character?: string | null; partial: boolean; sourceUrl: string; attribution: string; fetchedAt: string };
  candidates: Candidate[];
  checksumValid?: boolean;
  catalogConfirmed?: boolean;
}
const route = useRoute();
const brand = ref('');
const name = ref('');
const phase = ref<'idle' | 'searching' | 'done' | 'enriching'>('idle');
const result = ref<Resolution | null>(null);
const error = ref<string | null>(null);
const saved = ref<string | null>(null);
let ctrl: AbortController | null = null;

// Quick find: name, part of a name, brand, or barcode (EAN/UPC), like ISBN for books.
interface Suggestion { providerId: string | null; name: string; house: string; family: string | null; sourceUrl: string; exactToHint?: boolean }
interface Lookup {
  kind: 'text' | 'barcode';
  query: string;
  gtin14?: string;
  invalid?: boolean;
  message?: string;
  sourceDown: boolean;
  local?: { fragranceId: string; name: string; brand: string };
  hint?: { source: 'Open Beauty Facts' | 'Web search'; title: string; url: string | null; brand: string | null; name: string; sizeMl: number | null } | null;
  suggestions: Suggestion[];
}
const quick = ref('');
const finding = ref(false);
const lookup = ref<Lookup | null>(null);
const quickError = ref('');
const pendingBarcode = ref<{ gtin14: string; sizeMl: number | null } | null>(null);
const barcodeNote = ref('');
async function quickFind() {
  const q = quick.value.trim();
  if (q.length < 2) return;
  finding.value = true;
  quickError.value = '';
  lookup.value = null;
  barcodeNote.value = '';
  try {
    const r = await apiFetch<Lookup>('/api/v1/fragrances/lookup', { method: 'POST', body: { query: q } });
    lookup.value = r;
    pendingBarcode.value = r.kind === 'barcode' && r.gtin14 && !r.local ? { gtin14: r.gtin14, sizeMl: r.hint?.sizeMl ?? null } : null;
    const exact = r.suggestions.filter((x) => x.exactToHint);
    if (exact.length === 1) pick(exact[0]!);
  } catch (e) {
    quickError.value = e instanceof ApiFailure ? e.message : 'Search failed';
  } finally {
    finding.value = false;
  }
}
function pick(sug: Suggestion) {
  brand.value = sug.house;
  name.value = sug.name;
  submit();
}
function useHint() {
  const h = lookup.value?.hint;
  if (!h) return;
  brand.value = h.brand ?? '';
  name.value = h.name;
  if (brand.value && name.value) submit();
}
/** After a save (or an existing match), remember the barcode on that fragrance. */
async function attachBarcode(fragranceId: string) {
  const b = pendingBarcode.value;
  if (!b) return;
  try {
    await apiFetch(`/api/v1/fragrances/${fragranceId}/variants`, { method: 'POST', body: { gtin: b.gtin14, confirmed: true, ...(b.sizeMl ? { bottleMl: b.sizeMl } : {}) } });
    barcodeNote.value = `Barcode ${b.gtin14.replace(/^0+(?=\d{13}$)/, '')} saved to this fragrance; scanning it again finds it straight away.`;
    pendingBarcode.value = null;
  } catch (e) {
    barcodeNote.value = e instanceof ApiFailure && e.code === 'CONFLICT' ? 'This barcode is already linked to another fragrance; it was not changed.' : 'The barcode could not be saved; add it under Sizes & barcodes.';
  }
}
watch(saved, (id) => { if (id) void attachBarcode(id); });
// Already in the library: link the barcode to that fragrance too.
watch(() => result.value?.local?.fragranceId ?? result.value?.local?.fragrance_id, (id) => { if (id && result.value?.state === 'exact') void attachBarcode(id); });

async function run(body: Record<string, string>) {
  ctrl?.abort(); // never show out-of-order results
  ctrl = new AbortController();
  phase.value = 'searching';
  error.value = null;
  saved.value = null;
  result.value = null;
  try {
    result.value = await apiFetch<Resolution>('/api/v1/fragrances/resolve', { method: 'POST', body, signal: ctrl.signal });
    phase.value = 'done';
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    phase.value = 'idle';
    error.value = e instanceof ApiFailure ? (e.code === 'VALIDATION_FAILED' && (e.details as { reason?: string })?.reason === 'BAD_CHECK_DIGIT' ? 'That barcode has an invalid check digit.' : e.message) : 'Search failed';
  }
}
function submit() {
  if (!brand.value.trim() || !name.value.trim()) return;
  void run({ brand: brand.value.trim(), name: name.value.trim() });
}
onMounted(() => {
  const q = typeof route.query.q === 'string' ? route.query.q : '';
  if (!q) return;
  quick.value = q;
  void quickFind();
});
async function enrich() {
  const p = result.value?.profile;
  if (!p) return;
  phase.value = 'enriching';
  try {
    const r = await apiFetch<{ fragranceId: string }>('/api/v1/fragrances/enrich', { method: 'POST', body: { providerId: p.providerId, brand: brand.value.trim(), name: name.value.trim() } });
    saved.value = r.fragranceId;
  } catch (e) {
    error.value = e instanceof ApiFailure ? e.message : 'Enrichment failed';
  } finally {
    phase.value = 'done';
  }
}
async function draft() {
  try {
    const r = await apiFetch<{ fragranceId: string }>('/api/v1/fragrances/drafts', { method: 'POST', body: { brand: brand.value.trim(), name: name.value.trim() } });
    saved.value = r.fragranceId;
  } catch (e) {
    error.value = e instanceof ApiFailure ? e.message : 'Could not create the draft';
  }
}
const localId = computed(() => result.value?.local?.fragranceId ?? result.value?.local?.fragrance_id ?? null);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1>Discover</h1>
      <p class="m-0 mt-2 text-[15px] text-ink-2">Find an exact fragrance. Similar names are shown for review, never substituted.</p>
    </div>
    <section class="bay flex flex-col gap-4 p-4 md:p-5" aria-labelledby="quick-h">
      <h2 id="quick-h" class="text-[19px]">Quick find</h2>
      <form class="flex flex-col gap-1.5" @submit.prevent="quickFind">
        <label for="quick" class="text-[13px] font-medium text-ink-2">Name, part of a name, brand, or barcode (EAN)</label>
        <div class="flex gap-2">
          <input id="quick" v-model="quick" type="search" autocomplete="off" enterkeyhint="search" maxlength="120" placeholder="e.g. CK One, Rabanne, or 3616303473396" class="field" />
          <button type="submit" class="btn btn-primary" :disabled="finding || quick.trim().length < 2">{{ finding ? 'Finding…' : 'Find' }}</button>
        </div>
      </form>
      <p v-if="quickError" role="alert" class="m-0 text-[13px] text-bad">{{ quickError }}</p>
      <template v-if="lookup">
        <p v-if="lookup.message" role="status" class="m-0 text-[13px] text-ink-2">{{ lookup.message }}</p>
        <p v-if="lookup.sourceDown" class="m-0 text-[13px] text-warn">Scento is unavailable right now; try again shortly.</p>
        <div v-if="lookup.local" class="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-3">
          <p class="m-0 text-[14px]">This barcode is <strong class="font-medium">{{ lookup.local.brand }} {{ lookup.local.name }}</strong>, already in your library.</p>
          <NuxtLink :to="`/fragrances/${lookup.local.fragranceId}`" class="btn btn-quiet h-9 min-h-0">Open details <AppIcon name="arrow" :size="16" /></NuxtLink>
        </div>
        <div v-if="lookup.hint" class="flex flex-col gap-2 rounded-control border border-line p-3" data-testid="barcode-hint">
          <p class="m-0 text-[13px] text-ink-3">Barcode <span class="readout">{{ lookup.gtin14?.replace(/^0+(?=\d{13}$)/, '') }}</span> is listed as</p>
          <p class="m-0 text-[15px] font-medium [overflow-wrap:anywhere]">{{ lookup.hint.title }}</p>
          <p class="m-0 text-[12px] text-ink-3">
            Source: <a v-if="lookup.hint.url" :href="lookup.hint.url" target="_blank" rel="noopener noreferrer">{{ lookup.hint.source }}<span class="sr-only"> (opens in a new tab)</span></a><span v-else>{{ lookup.hint.source }}</span>
            <template v-if="lookup.hint.sizeMl"> · <span class="readout">{{ lookup.hint.sizeMl }} ml</span></template>
            · a hint only; the fragrance is verified below
          </p>
          <button type="button" class="btn btn-ghost h-9 min-h-0 self-start" @click="useHint">Search for “{{ [lookup.hint.brand, lookup.hint.name].filter(Boolean).join(' ') }}”</button>
        </div>
        <div v-if="lookup.suggestions.length" class="flex flex-col gap-2">
          <p class="m-0 text-[13px] text-ink-3">Scento suggestions. Pick one to verify it exactly; similar names are not the same fragrance.</p>
          <ul class="m-0 list-none overflow-hidden rounded-control border border-line p-0" aria-label="Suggestions">
            <li v-for="sug in lookup.suggestions" :key="sug.sourceUrl + sug.name" class="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0">
              <span class="min-w-0 text-[14px]">
                <span class="font-medium">{{ sug.name }}</span> <span class="text-ink-3">{{ sug.house }}</span>
                <span v-if="sug.exactToHint" class="ml-1.5 rounded-[4px] border border-line-strong px-1 text-[11px] text-ink">matches the barcode</span>
              </span>
              <button type="button" class="btn btn-ghost h-8 min-h-0 shrink-0 px-2.5 text-[13px]" @click="pick(sug)">Check this one</button>
            </li>
          </ul>
        </div>
        <p v-else-if="lookup.kind === 'text' && !lookup.sourceDown" class="m-0 text-[13px] text-ink-2">No Scento suggestions. Try the exact search below, or create a draft.</p>
      </template>
      <p v-if="pendingBarcode" class="m-0 text-[12px] text-ink-3">The barcode will be saved to the fragrance you add from here.</p>
      <p v-if="barcodeNote" role="status" class="m-0 text-[13px] text-ink-2">{{ barcodeNote }}</p>
    </section>

    <GlassPanel variant="solid" as="form" class="grid gap-3 p-4 md:grid-cols-[1fr_2fr_auto] md:items-end md:p-5" @submit.prevent="submit">
      <div class="flex flex-col gap-1">
        <label for="brand" class="text-[13px] font-medium text-ink-2">Brand</label>
        <input id="brand" v-model="brand" autocomplete="off" placeholder="Rabanne" class="field" />
      </div>
      <div class="flex flex-col gap-1">
        <label for="name" class="text-[13px] font-medium text-ink-2">Fragrance name</label>
        <input id="name" v-model="name" autocomplete="off" placeholder="Phantom in Red" class="field" />
      </div>
      <button type="submit" :disabled="phase === 'searching' || !brand || !name" class="btn btn-primary">Search</button>
    </GlassPanel>

    <p v-if="phase === 'searching'" role="status" class="m-0 text-[13px] text-ink-2">Searching and verifying with Scento…</p>
    <StatusBanner v-if="error" tone="error" title="Something went wrong">{{ error }} <button type="button" class="underline" @click="submit">Retry</button></StatusBanner>

    <section v-if="result" aria-live="polite" class="flex flex-col gap-4">
      <StatusBanner v-if="result.state === 'exact'" tone="success" :title="result.local && !result.profile ? 'Already in your library' : 'Exact match verified'">{{ result.reason }}</StatusBanner>
      <StatusBanner v-else-if="result.state === 'conflict'" tone="warning" title="Needs review: source conflict">{{ result.reason }}</StatusBanner>
      <StatusBanner v-else-if="result.state === 'candidate_needs_review'" tone="warning" title="No exact match: review similar names">{{ result.reason }}</StatusBanner>
      <StatusBanner v-else tone="info" title="Not found">{{ result.reason }}</StatusBanner>

      <template v-if="result.profile">
        <article class="bay overflow-hidden" aria-label="Verified source profile">
          <div class="flex flex-col gap-4 border-b border-line p-5 md:flex-row md:items-start md:justify-between">
            <div class="min-w-0">
              <h2 class="text-[28px] [overflow-wrap:anywhere]">{{ result.profile.name }}</h2>
              <p class="m-0 mt-1 text-ink-2">
                <span class="text-ink">{{ result.profile.house }}</span> <span class="text-ink-3">/</span>
                {{ result.profile.concentration ? CONCENTRATION_LABEL[result.profile.concentration] : result.profile.concentrationRaw ?? 'Concentration not listed' }}
                <template v-if="result.profile.family"> <span class="text-ink-3">/</span> {{ result.profile.family }}<template v-if="result.profile.subfamily">, {{ result.profile.subfamily }}</template></template>
              </p>
              <p class="m-0 mt-2 text-[12px] text-ink-3">According to <a :href="result.profile.sourceUrl" rel="noopener noreferrer" target="_blank">{{ result.profile.attribution }}<span class="sr-only"> (opens in a new tab)</span></a></p>
            </div>
            <FragranceIdentityMark v-if="result.state === 'exact'" status="verified" class="shrink-0" />
          </div>
          <div class="flex flex-col gap-5 p-5">
            <FragranceChromatogram :pyramid="result.profile.pyramid" label="Scent pyramid" />
            <FragranceListedNotes :notes="result.profile.listedNotes ?? []" :materials="result.profile.signatureMaterials ?? []" source="Scento" />
            <p v-if="result.profile.character" class="m-0 max-w-[68ch] text-[14px] text-ink-2">{{ result.profile.character }}</p>
          </div>
        </article>
        <div class="flex flex-wrap gap-3">
          <button v-if="!saved" type="button" :disabled="phase === 'enriching'" class="btn btn-primary" @click="enrich">
            {{ phase === 'enriching' ? 'Saving…' : 'Confirm and save to library' }}
          </button>
          <NuxtLink v-else :to="`/fragrances/${saved}`" class="btn btn-primary">Saved: open details <AppIcon name="arrow" :size="18" /></NuxtLink>
        </div>
      </template>
      <NuxtLink v-else-if="localId" :to="`/fragrances/${localId}`" class="btn btn-quiet w-fit">Open details <AppIcon name="arrow" :size="18" /></NuxtLink>
      <NuxtLink v-if="result.state === 'exact' && (saved || localId)" :to="`/compare?a=${saved || localId}`" class="btn btn-ghost w-fit"><AppIcon name="columns" :size="16" /> Compare to a fragrance I own</NuxtLink>

      <div v-if="result.candidates.length" class="bay p-5">
        <h3 class="mb-3 text-[15px]">Similar names (not the same fragrance unless verified)</h3>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="c in result.candidates" :key="c.sourceUrl + c.name" class="flex flex-col gap-0.5 border-t border-line pt-2 first:border-0 first:pt-0">
            <span class="font-semibold [overflow-wrap:anywhere]">{{ c.house }} · {{ c.name }}</span>
            <span class="text-[14px] text-ink-2">{{ c.reason }}</span>
          </li>
        </ul>
      </div>
      <div v-if="(result.state === 'unresolved' || result.state === 'candidate_needs_review') && !result.local && !saved && brand && name" class="bay flex flex-col gap-2 rounded-card p-4 md:p-5">
        <h3>Create a manual draft</h3>
        <p class="m-0 text-[14px] text-ink-2">Records “{{ brand }} {{ name }}” as an unverified draft with no invented notes. You can add sourced facts later.</p>
        <button type="button" class="btn btn-quiet w-fit" @click="draft">Create draft</button>
      </div>
      <NuxtLink v-if="saved && !result.profile" :to="`/fragrances/${saved}`" class="btn btn-quiet w-fit">Open the draft <AppIcon name="arrow" :size="16" /></NuxtLink>
    </section>
    <SearchRecommendations />
  </div>
</template>
