<script setup lang="ts">
// Owner image controls (Phase 12): upload, attach an approved remote URL, set or clear the primary
// choice, refresh a remote image, remove an image, and inspect source, attribution and verification.
// Nothing changes the primary without an explicit action here.
import { IMAGE_SOURCE_LABEL, type ImageAsset, type ImageCandidate, type ImagesResponse } from '~~/shared/types';

const props = defineProps<{ fragranceId: string; name: string }>();
const emit = defineEmits<{ changed: [primaryId: string | null] }>();
const data = ref<ImagesResponse | null>(null);
const error = ref('');
const message = ref('');
const busy = ref(false);
const file = ref<File | null>(null);
const uploadLabel = ref('Your photo');
const uploadPrimary = ref(true);
const remote = reactive({ kind: 'approved_remote' as 'approved_remote' | 'manual_external', url: '', attribution: '', licenseNotes: '' });
const confirmRemove = ref<string | null>(null);
const barcode = ref('');
const lookupPrimary = ref(false);
type BarcodeResult = { barcode: string; found: boolean; reason?: string; productName?: string; brands?: string; candidate: ImageCandidate | null };
const barcodeResults = ref<BarcodeResult[] | null>(null);
const barcodeMessage = ref('');
const webCandidates = ref<ImageCandidate[] | null>(null);
const webMessage = ref('');
const searching = ref<'barcode' | 'web' | null>(null);

async function load() {
  error.value = '';
  try {
    data.value = await apiFetch<ImagesResponse>(`/api/v1/fragrances/${props.fragranceId}/images`);
    emit('changed', data.value.primaryId);
    if (!data.value.sources[remote.kind].enabled && data.value.sources.manual_external.enabled) remote.kind = 'manual_external';
  } catch (e) {
    error.value = e instanceof ApiFailure ? e.message : 'Images unavailable';
  }
}
watch(() => props.fragranceId, load, { immediate: true });

const remoteEnabled = computed(() => !!data.value && (data.value.sources.approved_remote.enabled || data.value.sources.manual_external.enabled));
const failure = (e: unknown, verb: string) => {
  if (e instanceof ApiFailure) {
    const code = (e.details as { failureCode?: string } | undefined)?.failureCode;
    return `${verb}: ${e.message}${code ? ` (${code})` : ''}`;
  }
  return `${verb}.`;
};

async function act(fn: () => Promise<unknown>, ok: string, verb: string) {
  busy.value = true;
  message.value = '';
  try {
    await fn();
    message.value = ok;
  } catch (e) {
    message.value = failure(e, verb);
  } finally {
    busy.value = false;
    await load();
  }
}

function onFile(ev: Event) {
  file.value = (ev.target as HTMLInputElement).files?.[0] ?? null;
}
const upload = () =>
  act(
    () => {
      if (!file.value) throw new Error('no file');
      const qs = new URLSearchParams({ attribution: uploadLabel.value.trim() || 'Your photo', makePrimary: String(uploadPrimary.value) });
      return apiFetch(`/api/v1/fragrances/${props.fragranceId}/images/upload?${qs}`, { method: 'POST', raw: file.value });
    },
    'Image added.',
    'Not added',
  );
const attach = () =>
  act(
    () =>
      apiFetch(`/api/v1/fragrances/${props.fragranceId}/images/remote`, {
        method: 'POST',
        body: { kind: remote.kind, url: remote.url.trim(), attribution: remote.attribution.trim(), ...(remote.licenseNotes.trim() ? { licenseNotes: remote.licenseNotes.trim() } : {}) },
      }),
    'Remote image fetched and stored.',
    'Not attached',
  );
const setPrimary = (i: ImageAsset) => act(() => apiFetch(`/api/v1/images/${i.id}/primary`, { method: 'PUT' }), 'Primary image set.', 'Not changed');
const clearPrimary = (i: ImageAsset) => act(() => apiFetch(`/api/v1/images/${i.id}/primary`, { method: 'DELETE' }), 'Primary choice cleared; source order applies.', 'Not changed');
const refresh = (i: ImageAsset) => act(() => apiFetch(`/api/v1/images/${i.id}/refresh`, { method: 'POST' }), 'Remote image checked.', 'Not refreshed');
const remove = (i: ImageAsset) =>
  act(
    async () => {
      await apiFetch(`/api/v1/images/${i.id}`, { method: 'DELETE' });
      confirmRemove.value = null;
    },
    'Image removed.',
    'Not removed',
  );
async function lookupBarcode(useKnown: boolean) {
  searching.value = 'barcode';
  barcodeMessage.value = '';
  barcodeResults.value = null;
  try {
    const r = await apiFetch<{ results: BarcodeResult[]; message?: string }>(`/api/v1/fragrances/${props.fragranceId}/images/barcode`, {
      method: 'POST',
      body: useKnown ? {} : { barcode: barcode.value.trim() },
    });
    barcodeResults.value = r.results;
    barcodeMessage.value = r.message ?? (r.results.some((x) => x.candidate) ? '' : 'No photo found for this barcode.');
  } catch (e) {
    barcodeMessage.value = failure(e, 'Lookup failed');
  } finally {
    searching.value = null;
  }
}
async function searchWeb() {
  searching.value = 'web';
  webMessage.value = '';
  webCandidates.value = null;
  try {
    const r = await apiFetch<{ available: boolean; message?: string; candidates: ImageCandidate[] }>(`/api/v1/fragrances/${props.fragranceId}/images/search`, { method: 'POST' });
    webCandidates.value = r.candidates;
    webMessage.value = !r.available ? (r.message ?? 'Web search unavailable.') : r.candidates.length ? '' : 'No result page named exactly this fragrance with a usable image.';
  } catch (e) {
    webMessage.value = failure(e, 'Search failed');
  } finally {
    searching.value = null;
  }
}
const useCandidate = (c: ImageCandidate) =>
  act(() => apiFetch(`/api/v1/fragrances/${props.fragranceId}/images/candidates/${c.id}`, { method: 'POST', body: { makePrimary: lookupPrimary.value } }), 'Image added from ' + c.siteName + '.', 'Not added');

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never');
const kb = (n: number | null) => (n ? `${Math.round(n / 1024)} KB` : '');
</script>

<template>
  <details class="bay p-5" data-testid="image-manager">
    <summary class="tap font-medium">
      <AppIcon name="plus" :size="16" class="text-ink-3" /> Images
      <span v-if="data" class="readout text-[12px] font-normal text-ink-3">{{ data.images.filter((i) => i.status === 'available').length }}</span>
    </summary>
    <div class="mt-4 flex flex-col gap-5">
      <StatusBanner v-if="error" tone="error" title="Images unavailable">{{ error }} <button type="button" class="underline" @click="load">Retry</button></StatusBanner>
      <p v-if="message" role="status" class="m-0 text-[13px]" :class="message.startsWith('Not') ? 'text-bad' : 'text-ink-2'">{{ message }}</p>

      <ul v-if="data?.images.length" class="m-0 flex list-none flex-col gap-px overflow-hidden rounded-control border border-line bg-line p-0" aria-label="Images">
        <li v-for="i in data.images" :key="i.id" class="flex gap-3 bg-panel p-3" :aria-label="`${IMAGE_SOURCE_LABEL[i.sourceKind]} image, ${i.status}`">
          <FragranceImage :image-id="i.status === 'available' ? i.id : null" :alt="`${name}: ${i.attribution}`" size="card" />
          <div class="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
            <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-medium text-ink">{{ IMAGE_SOURCE_LABEL[i.sourceKind] }}</span>
              <span v-if="i.effectivePrimary" class="rounded-[4px] border border-line-strong px-1.5 text-[11px] text-ink" data-testid="primary-badge">Primary{{ i.isPrimary ? ' (your choice)' : '' }}</span>
              <span v-if="i.status !== 'available'" class="text-[12px] text-bad">{{ i.status === 'rejected' ? 'Rejected' : 'Failed' }}</span>
            </p>
            <p class="m-0 text-ink-2 [overflow-wrap:anywhere]">{{ i.attribution }}<template v-if="i.licenseNotes"> · {{ i.licenseNotes }}</template></p>
            <p v-if="i.sourceRef" class="m-0 truncate text-[12px] text-ink-3" :title="i.sourceRef">{{ i.sourceRef }}</p>
            <p v-if="i.status === 'available'" class="readout m-0 text-[11px] text-ink-3">{{ i.width }}×{{ i.height }} · {{ i.mimeType?.replace('image/', '') }} · {{ kb(i.byteSize) }} · checked {{ when(i.lastVerifiedAt) }}</p>
            <p v-if="i.failureCode" class="m-0 text-[12px]" :class="i.status === 'available' ? 'text-warn' : 'text-bad'">
              {{ i.status === 'available' ? 'Last check failed' : 'Not stored' }}: {{ i.failureDetail }} <span class="readout">({{ i.failureCode }})</span>
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <button v-if="i.status === 'available' && !i.isPrimary" type="button" class="btn btn-ghost h-8 min-h-0 px-2.5 text-[12px]" :disabled="busy" @click="setPrimary(i)">Set as primary</button>
              <button v-if="i.isPrimary" type="button" class="btn btn-ghost h-8 min-h-0 px-2.5 text-[12px]" :disabled="busy" @click="clearPrimary(i)">Clear primary choice</button>
              <button v-if="i.sourceKind === 'approved_remote' || i.sourceKind === 'manual_external'" type="button" class="btn btn-ghost h-8 min-h-0 px-2.5 text-[12px]" :disabled="busy" @click="refresh(i)">Refresh</button>
              <template v-if="confirmRemove === i.id">
                <button type="button" class="btn btn-quiet h-8 min-h-0 px-2.5 text-[12px] text-bad" :disabled="busy" @click="remove(i)">Confirm remove</button>
                <button type="button" class="btn btn-ghost h-8 min-h-0 px-2.5 text-[12px]" @click="confirmRemove = null">Cancel</button>
              </template>
              <button v-else type="button" class="btn btn-ghost h-8 min-h-0 px-2.5 text-[12px]" :disabled="busy" @click="confirmRemove = i.id">Remove</button>
            </div>
          </div>
        </li>
      </ul>
      <p v-else-if="data" class="m-0 text-[13px] text-ink-2">No verified image yet. Upload your own photo, or attach one from an approved host.</p>

      <section v-if="data" class="flex flex-col gap-3 border-t border-line pt-4" aria-labelledby="find-images-h">
        <h3 id="find-images-h" class="text-[15px]">Find an image</h3>
        <label class="flex items-center gap-2 text-[13px]"><input v-model="lookupPrimary" type="checkbox" class="size-4 accent-[var(--action)]" /> Make the image I pick the primary image</label>
        <div class="flex flex-col gap-2">
          <p class="m-0 text-[13px] font-medium text-ink-2">By barcode <span class="font-normal text-ink-3">· {{ data.lookups.barcode.note }}</span></p>
          <div class="flex flex-wrap gap-2">
            <button v-if="data.lookups.barcode.barcodes.length" type="button" class="btn btn-quiet h-9 min-h-0" :disabled="!!searching" @click="lookupBarcode(true)">
              {{ searching === 'barcode' ? 'Looking up…' : `Look up my barcode${data.lookups.barcode.barcodes.length > 1 ? 's' : ''}` }}
            </button>
            <form class="flex min-w-0 flex-1 gap-2" @submit.prevent="lookupBarcode(false)">
              <label for="lookup-barcode" class="sr-only">Barcode from your bottle or box</label>
              <input id="lookup-barcode" v-model="barcode" inputmode="numeric" maxlength="20" placeholder="Barcode from your bottle or box" class="field h-9 min-h-0 min-w-0 flex-1" />
              <button type="submit" class="btn btn-quiet h-9 min-h-0" :disabled="!!searching || barcode.replace(/\D/g, '').length < 8">Look up</button>
            </form>
          </div>
          <p v-if="barcodeMessage" role="status" class="m-0 text-[12px] text-ink-2">{{ barcodeMessage }}</p>
          <ul v-if="barcodeResults?.some((r) => !r.found)" class="m-0 list-none p-0 text-[12px] text-ink-3">
            <li v-for="r in barcodeResults.filter((x) => !x.found)" :key="r.barcode"><span class="readout">{{ r.barcode }}</span>: {{ r.reason }}</li>
          </ul>
          <ul v-if="barcodeResults?.some((r) => r.candidate)" class="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3" aria-label="Barcode results">
            <FragranceImageCandidate v-for="r in barcodeResults.filter((x) => x.candidate)" :key="r.candidate!.id" :candidate="r.candidate!" :name="name" :busy="busy" @use="useCandidate(r.candidate!)" />
          </ul>
        </div>
        <div class="flex flex-col gap-2">
          <p class="m-0 text-[13px] font-medium text-ink-2">On the web <span class="font-normal text-ink-3">· {{ data.lookups.webSearch.enabled ? data.lookups.webSearch.note : 'Off: no TinyFish key in Vault (make tinyfish-key).' }}</span></p>
          <button v-if="data.lookups.webSearch.enabled" type="button" class="btn btn-quiet h-9 min-h-0 self-start" :disabled="!!searching" @click="searchWeb">
            {{ searching === 'web' ? 'Searching…' : 'Search the web for this bottle' }}
          </button>
          <p v-if="webMessage" role="status" class="m-0 text-[12px] text-ink-2">{{ webMessage }}</p>
          <ul v-if="webCandidates?.length" class="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3" aria-label="Web results">
            <FragranceImageCandidate v-for="c in webCandidates" :key="c.id" :candidate="c" :name="name" :busy="busy" @use="useCandidate(c)" />
          </ul>
          <p v-if="webCandidates?.length" class="m-0 text-[11px] text-ink-3">Only pages that name exactly this fragrance are shown. The picture is copied to your Mac for personal use, with its page as the source.</p>
        </div>
      </section>

      <form class="flex flex-col gap-3 border-t border-line pt-4" @submit.prevent="upload">
        <h3 class="text-[15px]">Upload your photo</h3>
        <div class="flex flex-col gap-1.5">
          <label for="image-file" class="text-[13px] font-medium text-ink-2">Image file <span class="font-normal text-ink-3">(JPEG, PNG or WebP, up to 10 MB)</span></label>
          <input id="image-file" type="file" accept="image/jpeg,image/png,image/webp" class="text-[13px] text-ink-2 file:mr-3 file:rounded-control file:border file:border-line file:bg-raised file:px-3 file:py-1.5 file:text-ink" @change="onFile" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="image-label" class="text-[13px] font-medium text-ink-2">Attribution</label>
          <input id="image-label" v-model="uploadLabel" maxlength="200" class="field" />
        </div>
        <label class="flex items-center gap-2 text-[13px]"><input v-model="uploadPrimary" type="checkbox" class="size-4 accent-[var(--action)]" /> Make this the primary image</label>
        <button type="submit" class="btn btn-quiet self-start" :disabled="busy || !file">{{ busy ? 'Working…' : 'Upload image' }}</button>
        <p class="m-0 text-[12px] text-ink-3">Stored on this Mac, outside the app containers. The display copy drops camera metadata such as location.</p>
      </form>

      <form v-if="remoteEnabled && data" class="flex flex-col gap-3 border-t border-line pt-4" @submit.prevent="attach">
        <h3 class="text-[15px]">Attach from an approved host</h3>
        <div class="flex flex-col gap-1.5">
          <label for="remote-kind" class="text-[13px] font-medium text-ink-2">Source</label>
          <select id="remote-kind" v-model="remote.kind" class="field">
            <option value="approved_remote" :disabled="!data.sources.approved_remote.enabled">Approved provider</option>
            <option value="manual_external" :disabled="!data.sources.manual_external.enabled">External URL</option>
          </select>
          <p class="m-0 text-[12px] text-ink-3">{{ data.sources[remote.kind].note }}</p>
        </div>
        <div class="flex flex-col gap-1.5"><label for="remote-url" class="text-[13px] font-medium text-ink-2">Image URL (https)</label><input id="remote-url" v-model="remote.url" type="url" maxlength="2048" class="field" /></div>
        <div class="flex flex-col gap-1.5"><label for="remote-attr" class="text-[13px] font-medium text-ink-2">Attribution</label><input id="remote-attr" v-model="remote.attribution" maxlength="200" class="field" /></div>
        <div class="flex flex-col gap-1.5"><label for="remote-license" class="text-[13px] font-medium text-ink-2">Usage or licence notes <span class="font-normal text-ink-3">(optional)</span></label><input id="remote-license" v-model="remote.licenseNotes" maxlength="1000" class="field" /></div>
        <button type="submit" class="btn btn-quiet self-start" :disabled="busy || !remote.url.trim() || !remote.attribution.trim()">Fetch and store</button>
      </form>

      <dl v-if="data" class="m-0 grid gap-x-4 gap-y-1.5 border-t border-line pt-4 text-[12px] text-ink-3 sm:grid-cols-[max-content_1fr]">
        <template v-for="k in data.sources.precedence" :key="k">
          <dt class="text-ink-2">{{ data.sources.precedence.indexOf(k) + 1 }}. {{ IMAGE_SOURCE_LABEL[k] }}</dt>
          <dd class="m-0">{{ data.sources[k].enabled ? data.sources[k].note : `Off: ${data.sources[k].note}` }}</dd>
        </template>
      </dl>
    </div>
  </details>
</template>
