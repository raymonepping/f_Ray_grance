<script setup lang="ts">
// Add a fragrance from a shop page (ADR-023), for when Scento cannot verify it. You paste an
// ICI PARIS XL product URL; the page is read through TinyFish; you check the preview, may correct the
// brand and name, and confirm. It is saved as "Confirmed by you" (never "Verified"), with the page's
// notes as your own entry citing the page.
const props = defineProps<{ barcode?: string | null }>();
const emit = defineEmits<{ saved: [fragranceId: string] }>();

interface Preview {
  id: string;
  shop: string;
  url: string;
  brand: string;
  name: string;
  concentration: string | null;
  concentrationRaw: string | null;
  notes: { top: string[] | null; heart: string[] | null; base: string[] | null };
  pageEan: string | null;
}
const url = ref('');
const preview = ref<Preview | null>(null);
const brand = ref('');
const name = ref('');
const keepNotes = ref(true);
const busy = ref<'read' | 'save' | null>(null);
const message = ref('');
const done = ref<{ id: string; status: string; created: boolean } | null>(null);
const sameEan = computed(() => !props.barcode || !preview.value?.pageEan || props.barcode.replace(/^0+/, '') === preview.value.pageEan.replace(/^0+/, ''));

async function read() {
  busy.value = 'read';
  message.value = '';
  preview.value = null;
  done.value = null;
  try {
    const r = await apiFetch<{ available: boolean; message?: string; preview?: Preview }>('/api/v1/fragrances/from-shop/preview', { method: 'POST', body: { url: url.value.trim() } });
    if (!r.available || !r.preview) {
      message.value = r.message ?? 'The shop page could not be read.';
      return;
    }
    preview.value = r.preview;
    brand.value = r.preview.brand;
    name.value = r.preview.name;
  } catch (e) {
    message.value = e instanceof ApiFailure && e.code === 'RATE_LIMITED' ? 'Limit reached (6 pages per 10 minutes). Try again later.' : e instanceof ApiFailure ? e.message : 'The shop page could not be read.';
  } finally {
    busy.value = null;
  }
}

async function confirm() {
  if (!preview.value) return;
  busy.value = 'save';
  message.value = '';
  try {
    const r = await apiFetch<{ fragranceId: string; created: boolean; identityStatus: string; notesSaved: boolean }>(`/api/v1/fragrances/from-shop/${preview.value.id}/confirm`, {
      method: 'POST',
      body: { brand: brand.value.trim(), name: name.value.trim(), keepNotes: keepNotes.value },
    });
    done.value = { id: r.fragranceId, status: r.identityStatus, created: r.created };
    message.value =
      r.identityStatus === 'verified'
        ? 'This fragrance is already verified by Scento, so nothing was changed.'
        : `${r.created ? 'Added' : 'Updated'} as “Confirmed by you”${r.notesSaved ? ', with the notes from the page' : ''}.`;
    preview.value = null;
    emit('saved', r.fragranceId);
  } catch (e) {
    message.value = e instanceof ApiFailure ? `Not saved: ${e.message}` : 'Not saved.';
  } finally {
    busy.value = null;
  }
}
const tiers = [['top', 'Top'], ['heart', 'Heart'], ['base', 'Base']] as const;
</script>

<template>
  <section class="bay flex flex-col gap-3 p-4 md:p-5" aria-labelledby="shop-h" data-testid="shop-evidence">
    <h2 id="shop-h">Add from a shop page</h2>
    <p class="m-0 text-[14px] text-ink-2">For a fragrance Scento does not list, or lists wrongly. Paste its ICI PARIS XL product page; you check what it says before anything is saved. It is saved as “Confirmed by you”, never as verified.</p>
    <form class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="read">
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <label for="shop-url" class="text-[13px] font-medium text-ink-2">Product page URL</label>
        <input id="shop-url" v-model="url" type="url" inputmode="url" autocomplete="off" placeholder="https://www.iciparisxl.nl/…/p/BP_…" class="field min-w-0" />
      </div>
      <button type="submit" class="btn btn-quiet" :disabled="busy !== null || url.trim().length < 10">{{ busy === 'read' ? 'Reading the page…' : 'Read page' }}</button>
    </form>
    <p class="m-0 text-[11px] text-ink-3">Sends only the URL to TinyFish, which reads the page (one TinyFish credit).</p>
    <p v-if="message" role="status" class="m-0 text-[13px] text-ink-2">{{ message }}</p>
    <NuxtLink v-if="done" :to="`/fragrances/${done.id}`" class="btn btn-quiet w-fit">Open the fragrance <AppIcon name="arrow" :size="16" /></NuxtLink>

    <article v-if="preview" class="flex flex-col gap-3 rounded-control border border-line p-4" aria-label="What the shop page says">
      <p class="m-0 text-[12px] text-ink-3">From <a :href="preview.url" target="_blank" rel="noopener noreferrer">{{ preview.shop }}<span class="sr-only"> (opens in a new tab)</span></a> · check and correct before confirming</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-1.5"><label for="shop-brand" class="text-[13px] font-medium text-ink-2">Brand</label><input id="shop-brand" v-model="brand" class="field" /></div>
        <div class="flex flex-col gap-1.5"><label for="shop-name" class="text-[13px] font-medium text-ink-2">Name</label><input id="shop-name" v-model="name" class="field" /></div>
      </div>
      <p class="m-0 text-[13px]"><span class="text-ink-3">Concentration:</span> {{ preview.concentrationRaw ?? 'not stated' }}<span v-if="preview.concentrationRaw && !preview.concentration" class="text-warn"> (not recognised, so not saved)</span></p>
      <dl class="m-0 grid gap-2 text-[13px] sm:grid-cols-3">
        <div v-for="[k, label] in tiers" :key="k" class="min-w-0 border-t border-line pt-2">
          <dt class="etch">{{ label }}</dt>
          <dd class="m-0 mt-1 text-ink-2 [overflow-wrap:anywhere]">{{ preview.notes[k]?.join(', ') ?? 'Not listed' }}</dd>
        </div>
      </dl>
      <p v-if="preview.pageEan" class="m-0 text-[13px]">
        <span class="text-ink-3">EAN on the page:</span> <span class="readout">{{ preview.pageEan }}</span>
        <span v-if="!sameEan" class="text-ink-3"> · differs from your barcode, so it is probably another size; your own barcode is the one saved.</span>
      </p>
      <label class="flex items-center gap-2 text-[13px]"><input v-model="keepNotes" type="checkbox" class="size-4 accent-[var(--action)]" /> Keep the notes from the page as my own entry</label>
      <button type="button" class="btn btn-primary w-fit" :disabled="busy !== null || !brand.trim() || !name.trim()" @click="confirm">{{ busy === 'save' ? 'Saving…' : 'Confirm and add' }}</button>
    </article>
  </section>
</template>
