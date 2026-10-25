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
  profile?: { providerId: string; name: string; house: string; concentration: string | null; concentrationRaw: string | null; family: string | null; subfamily: string | null; pyramid: Pyramid; partial: boolean; sourceUrl: string; attribution: string; fetchedAt: string };
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

function splitQuery(q: string) {
  if (/^[\d\s-]{8,20}$/.test(q)) return { gtin: q };
  const parts = q.trim().split(/\s+/);
  return { brand: parts[0] ?? '', name: parts.slice(1).join(' ') };
}
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
  const s = splitQuery(q);
  if ('gtin' in s) void run({ gtin: s.gtin! });
  else {
    brand.value = s.brand;
    name.value = s.name;
    if (s.brand && s.name) submit();
  }
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
          <div class="p-5"><FragranceChromatogram :pyramid="result.profile.pyramid" label="Scent pyramid" /></div>
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
