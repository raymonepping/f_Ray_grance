<script setup lang="ts">
// Package sizes and barcodes (DATA_MODEL §3): a GTIN identifies a package, not the scent.
import type { Variant } from '~~/shared/types';
const props = defineProps<{ fragranceId: string; variants: Variant[] }>();
const emit = defineEmits<{ changed: [] }>();
const gtin = ref('');
const ml = ref<number | null>(null);
const confirmed = ref(false);
const message = ref('');
const error = ref(false);
async function add() {
  message.value = '';
  error.value = false;
  try {
    await apiFetch(`/api/v1/fragrances/${props.fragranceId}/variants`, {
      method: 'POST',
      body: { ...(gtin.value.trim() ? { gtin: gtin.value.trim() } : {}), ...(ml.value ? { bottleMl: ml.value } : {}), confirmed: confirmed.value },
    });
    gtin.value = '';
    ml.value = null;
    confirmed.value = false;
    message.value = 'Saved.';
    emit('changed');
  } catch (e) {
    error.value = true;
    message.value =
      e instanceof ApiFailure && (e.details as { reason?: string })?.reason === 'BAD_CHECK_DIGIT'
        ? 'That barcode has an invalid check digit.'
        : e instanceof ApiFailure && e.code === 'CONFLICT'
          ? 'That barcode is already confirmed for a fragrance.'
          : 'Not saved.';
  }
}
</script>

<template>
  <details class="surface-solid rounded-card p-4 md:p-5">
    <summary class="tap flex cursor-pointer items-center gap-2 font-semibold">Sizes &amp; barcodes ({{ variants.length }})</summary>
    <ul v-if="variants.length" class="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-sm">
      <li v-for="v in variants" :key="v.id">
        {{ v.bottle_ml ? `${Number(v.bottle_ml)} ml` : 'Size not recorded' }}
        <template v-if="v.gtin14"> · <span class="tabular-nums">{{ v.gtin14 }}</span></template>
        · <span :class="v.verification_state === 'verified' ? 'text-ok' : 'text-ink-3'">{{ v.verification_state === 'verified' ? 'confirmed' : 'unconfirmed' }}</span>
      </li>
    </ul>
    <form class="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end" @submit.prevent="add">
      <div class="flex flex-col gap-1">
        <label :for="`gtin-${fragranceId}`" class="text-sm font-semibold">Barcode (EAN/GTIN)</label>
        <input :id="`gtin-${fragranceId}`" v-model="gtin" inputmode="numeric" autocomplete="off" class="tap rounded-control border border-line bg-sunken px-3 text-ink" />
      </div>
      <div class="flex flex-col gap-1">
        <label :for="`ml-${fragranceId}`" class="text-sm font-semibold">Size (ml)</label>
        <input :id="`ml-${fragranceId}`" v-model.number="ml" type="number" min="1" max="5000" class="tap rounded-control border border-line bg-sunken px-3 text-ink" />
      </div>
      <button type="submit" :disabled="!gtin.trim() && !ml" class="tap rounded-control border border-line px-4 disabled:opacity-50">Add size</button>
      <label class="tap flex items-center gap-2 text-sm sm:col-span-3">
        <input v-model="confirmed" type="checkbox" class="size-5 accent-[var(--accent-gold)]" :disabled="!gtin.trim()" />
        I checked this barcode on the box of this exact fragrance
      </label>
    </form>
    <p v-if="message" role="status" class="m-0 mt-2 text-sm" :class="error ? 'text-bad' : 'text-ok'">{{ message }}</p>
  </details>
</template>
