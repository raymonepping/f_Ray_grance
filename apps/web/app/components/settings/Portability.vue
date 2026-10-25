<script setup lang="ts">
interface Preview {previewHash:string;conflicts:string[];counts:Record<string,number>;target:string;destructive:boolean;applied:boolean}
const bundle=ref<unknown>(null);const preview=ref<Preview|null>(null);const confirmation=ref(false);const busy=ref(false);const message=ref('');
async function exportData(){busy.value=true;message.value='';try{const data=await apiFetch('/api/v1/export');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='f-ray-grance-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='Export downloaded. It contains private notes; store it somewhere protected.';}catch(e){message.value=e instanceof ApiFailure?e.message:'Export failed.';}finally{busy.value=false;}}
async function open(event:Event){preview.value=null;confirmation.value=false;message.value='';bundle.value=null;const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>4*1024*1024){message.value='Choose a JSON export smaller than 4 MiB.';return;}try{bundle.value=JSON.parse(await file.text());}catch{message.value='This is not a valid JSON file.';}}
async function inspect(){busy.value=true;message.value='';try{preview.value=await apiFetch<Preview>('/api/v1/import',{method:'POST',body:{bundle:bundle.value}});}catch(e){message.value=e instanceof ApiFailure?e.message:'Preview failed. Nothing was changed.';}finally{busy.value=false;}}
async function apply(){if(!preview.value||!confirmation.value||preview.value.conflicts.length)return;busy.value=true;try{const r=await apiFetch<Preview>('/api/v1/import',{method:'POST',body:{bundle:bundle.value,previewHash:preview.value.previewHash,confirm:'IMPORT INTO CURRENT OWNER'}});message.value=r.applied?'Import applied. Existing history was preserved.':'Nothing was changed.';preview.value=null;}catch(e){message.value=e instanceof ApiFailure?e.message:'Import failed. Nothing was changed.';}finally{busy.value=false;}}
</script>
<template>
  <section class="surface-solid flex min-w-0 flex-col gap-4 rounded-card p-5" aria-labelledby="portability-title">
    <h2 id="portability-title">Export &amp; import</h2>
    <p class="m-0 text-sm text-ink-2">Your versioned JSON export includes collection history, private notes, four-season choices and source-backed manual corrections. It is separate from a PostgreSQL recovery backup.</p>
    <button type="button" :disabled="busy" class="tap w-fit rounded-control border border-line px-4 disabled:opacity-60" @click="exportData">Export my collection</button>
    <label for="import-file">Preview a JSON export</label><input id="import-file" type="file" accept="application/json,.json" :disabled="busy" class="max-w-full text-sm" @change="open" />
    <button type="button" :disabled="!bundle||busy" class="tap w-fit rounded-control border border-line px-4 disabled:opacity-60" @click="inspect">Preview import</button>
    <div v-if="preview" class="flex flex-col gap-3 rounded-control border border-line p-3">
      <h3>Import preview</h3><p class="m-0">Target: {{ preview.target }}. Existing records are never overwritten.</p>
      <dl class="m-0 grid grid-cols-2 gap-2"><template v-for="(n,k) in preview.counts" :key="k"><dt class="[overflow-wrap:anywhere]">{{ String(k).replaceAll(/([A-Z])/g,' $1').toLowerCase() }}</dt><dd class="m-0">{{ n }}</dd></template></dl>
      <ul v-if="preview.conflicts.length" class="pl-5 text-warn"><li v-for="c in preview.conflicts" :key="c" class="[overflow-wrap:anywhere]">{{ c }}</li></ul>
      <p class="m-0 text-sm text-ink-2">Applying imports remains disabled until independent recovery has been verified by the operator. Preview is read-only.</p>
      <label class="tap flex items-center gap-2"><input v-model="confirmation" type="checkbox" :disabled="busy||preview.conflicts.length>0" /> I reviewed this file and the current-owner target.</label>
      <button type="button" :disabled="busy||!confirmation||preview.conflicts.length>0" class="tap w-fit rounded-control border border-line px-4 disabled:opacity-60" @click="apply">Apply reviewed import</button>
    </div>
    <p v-if="message" role="status" class="m-0 text-sm">{{ message }}</p>
  </section>
</template>
