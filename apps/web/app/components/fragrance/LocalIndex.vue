<script setup lang="ts">
const props = defineProps<{ fragranceId: string }>();
const message = ref(''); const busy = ref(false);
async function index() {
  busy.value = true; message.value = '';
  try { const r = await apiFetch<{ dimension: number; model: string }>(`/api/v1/fragrances/${props.fragranceId}/embedding`, { method: 'POST' }); message.value = `Local text index updated · ${r.model}. Private notes were excluded.`; }
  catch (e) { message.value = e instanceof ApiFailure ? e.message : 'Index unavailable; structured DNA remains usable.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <details class="bay p-5">
    <summary class="tap cursor-pointer font-medium">Local semantic search</summary>
    <p class="text-[14px] text-ink-2">Optional text embeddings can enrich discovery. This uses public source descriptors on your Mac, with no private annotations. Rebuild after source changes.</p>
    <button type="button" :disabled="busy" class="btn btn-quiet" @click="index">{{ busy ? 'Updating local text index…' : 'Update local text index' }}</button>
    <p v-if="message" role="status">{{ message }}</p>
  </details>
</template>
