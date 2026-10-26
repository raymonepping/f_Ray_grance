<script setup lang="ts">
import type { Fragrance } from '~~/shared/types';
usePageHeader({ title:'My DNA' });
type Choice='love'|'neutral'|'avoid'|'unsure';
type Group='notes'|'families'|'accords'|'traits';
interface Profile {season:string;choices:Record<Group,Record<string,Choice>>;freeText:string|null;fragrances:{fragrance_id:string;canonical_name:string;brand:string;affinity:string|null}[];collectionByState:{state:string;count:number}[];explanation:string}
const seasons=['spring','summer','autumn','winter'];const groups:Group[]=['notes','families','accords','traits'];
const active=ref('spring');const drafts=reactive<Record<string,Profile>>({});const profile=computed(()=>drafts[active.value]);
const loading=ref(false);const saving=ref(false);const message=ref('');const error=ref('');const category=ref<Group>('notes');const term=ref('');const opinion=ref<Choice>('love');
const library=ref<Fragrance[]>([]);const selected=ref('');const affinity=ref('love');
async function load(){if(drafts[active.value])return;const season=active.value;loading.value=true;error.value='';try{drafts[season]=await apiFetch<Profile>(`/api/v1/profile/seasons/${season}`);}catch(e){error.value=e instanceof ApiFailure?e.message:'Preferences unavailable.';}finally{loading.value=false;}}
watch(active,()=>{message.value='';void load();});
onMounted(async()=>{await load();try{library.value=(await apiFetch<{items:Fragrance[]}>('/api/v1/fragrances?limit=100')).items;}catch{error.value='Could not load saved fragrances.';}});
function add(){const name=term.value.trim();if(!profile.value||!name||['__proto__','prototype','constructor'].includes(name))return;profile.value.choices[category.value]={...profile.value.choices[category.value],[name]:opinion.value};term.value='';message.value='Unsaved choice added. Save this season to keep it.';}
function choose(group:Group,name:string,event:Event){const value=(event.target as HTMLSelectElement).value;if(value==='unrated')delete profile.value!.choices[group][name];else profile.value!.choices[group][name]=value as Choice;message.value='Unsaved changes.';}
async function save(){if(!profile.value)return;saving.value=true;error.value='';try{await apiFetch(`/api/v1/profile/seasons/${active.value}`,{method:'PATCH',body:{choices:profile.value.choices,freeText:profile.value.freeText}});message.value=`Saved ${active.value} preferences.`;}catch(e){error.value=e instanceof ApiFailure?e.message:'Not saved. Your choices are kept here.';}finally{saving.value=false;}}
async function associate(){if(!selected.value)return;saving.value=true;try{await apiFetch(`/api/v1/profile/seasons/${active.value}/fragrances/${selected.value}`,{method:'PUT',body:{affinity:affinity.value==='unrated'?null:affinity.value}});const r=await apiFetch<Profile>(`/api/v1/profile/seasons/${active.value}`);profile.value!.fragrances=r.fragrances;message.value='Saved seasonal fragrance choice.';}catch(e){error.value=e instanceof ApiFailure?e.message:'Not saved.';}finally{saving.value=false;}}
</script>
<template>
  <div class="flex min-w-0 max-w-4xl flex-col gap-6">
    <div><h1>My DNA</h1>
    <p class="m-0 mt-2 text-[15px] text-ink-2">Your own spring, summer, autumn and winter choices. No daily wear log, and no assumed likes from ownership.</p>
    <NuxtLink to="/spectrum" class="btn btn-ghost mt-2 h-9 min-h-0 px-2.5"><AppIcon name="spectrum" :size="16" /> See where your collection sits: My Spectrum</NuxtLink></div>
    <div class="flex w-fit max-w-full flex-wrap gap-1 rounded-control border border-line bg-sunken p-1" role="group" aria-label="Season">
      <button v-for="s in seasons" :key="s" type="button" :disabled="saving" :aria-pressed="active===s" class="motion flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-3 text-[14px] pointer-coarse:h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)] capitalize" :class="active===s?'bg-raised font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]':'text-ink-2 hover:text-ink'" @click="active=s">{{ s }}</button>
    </div>
    <StatusBanner v-if="error" tone="error" title="Not saved or unavailable">{{ error }} <button class="underline" type="button" @click="load">Retry</button></StatusBanner>
    <p v-if="loading" role="status" class="m-0 text-[13px] text-ink-2">Loading seasonal choices…</p>
    <template v-if="profile">
      <form class="bay flex flex-col gap-4 p-5" @submit.prevent="save">
        <h2 class="capitalize">{{ active }} preferences</h2>
        <p class="m-0 text-[14px] text-ink-2">Unrated means no choice. Neutral is an explicit opinion. Unsure keeps uncertainty visible.</p>
        <fieldset :disabled="saving" class="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <legend class="sr-only">Edit {{ active }} preferences</legend>
          <div class="grid min-w-0 gap-3 sm:grid-cols-2">
            <div class="flex min-w-0 flex-col gap-1.5"><label for="pref-category" class="text-[13px] font-medium text-ink-2">Type</label><select id="pref-category" v-model="category" class="field"><option v-for="g in groups" :key="g" :value="g" class="capitalize">{{ g.charAt(0).toUpperCase() + g.slice(1) }}</option></select></div>
            <div class="flex min-w-0 flex-col gap-1.5"><label for="pref-term" class="text-[13px] font-medium text-ink-2">Note, family, accord or trait</label><input id="pref-term" v-model="term" maxlength="80" class="field min-w-0" /></div>
            <div class="flex flex-col gap-1.5"><label for="pref-choice" class="text-[13px] font-medium text-ink-2">Your preference</label><select id="pref-choice" v-model="opinion" class="field"><option value="love">Love</option><option value="neutral">Neutral</option><option value="avoid">Avoid</option><option value="unsure">Unsure</option></select></div>
            <button type="button" :disabled="!term.trim()" class="btn btn-quiet self-end" @click="add">Add choice</button>
          </div>
          <div v-for="g in groups" :key="g" class="flex flex-col gap-2">
            <h3 class="etch m-0 font-normal">{{ g }}</h3>
            <p v-if="!Object.keys(profile.choices[g]).length" class="m-0 text-[14px] text-ink-2">Not rated yet.</p>
            <label v-for="(value,name) in profile.choices[g]" :key="name" class="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line py-2 text-[14px]">
              <span class="[overflow-wrap:anywhere]">{{ name }}</span><select :value="value" :aria-label="`${g}: ${name}`" class="field h-9 min-h-0 w-auto" @change="choose(g,String(name),$event)"><option value="unrated">Not rated</option><option value="love">Love</option><option value="neutral">Neutral</option><option value="avoid">Avoid</option><option value="unsure">Unsure</option></select>
            </label>
          </div>
          <label for="season-note" class="text-[13px] font-medium text-ink-2">Private seasonal note</label><textarea id="season-note" v-model="profile.freeText" maxlength="4000" rows="3" class="field min-w-0" />
          <button type="submit" class="btn btn-primary w-fit">{{ saving?'Saving…':'Save this season' }}</button>
        </fieldset>
      </form>
      <section class="bay flex flex-col gap-3 p-5" aria-labelledby="season-fragrance-title">
        <h2 id="season-fragrance-title">Fragrances for this season</h2>
        <div class="flex min-w-0 flex-col gap-2"><label for="season-fragrance" class="text-[13px] font-medium text-ink-2">Saved fragrance</label><select id="season-fragrance" v-model="selected" class="field w-full min-w-0"><option value="">Choose a fragrance</option><option v-for="f in library" :key="f.id" :value="f.id">{{ f.brand }} · {{ f.canonical_name }}</option></select></div>
        <label for="season-affinity" class="text-[13px] font-medium text-ink-2">Your seasonal affinity</label><select id="season-affinity" v-model="affinity" class="field"><option value="love">Love</option><option value="like">Like</option><option value="neutral">Neutral</option><option value="avoid">Avoid</option><option value="unsure">Unsure</option><option value="unrated">Not rated</option></select>
        <button :disabled="!selected||saving" type="button" class="btn btn-quiet w-fit" @click="associate">Save fragrance choice</button>
        <ul v-if="profile.fragrances.length" class="m-0 list-none overflow-hidden rounded-control border border-line p-0"><li v-for="f in profile.fragrances" :key="f.fragrance_id" class="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 text-[14px] last:border-b-0"><span class="min-w-0 [overflow-wrap:anywhere]">{{ f.canonical_name }} <span class="text-ink-3">{{ f.brand }}</span></span><span class="shrink-0 capitalize text-ink-2">{{ f.affinity??'Not rated' }}</span></li></ul>
        <NuxtLink :to="`/discover?season=${active}`" class="btn btn-ghost w-fit capitalize"><AppIcon name="compass" :size="16" /> Explore {{ active }}</NuxtLink>
      </section>
      <section class="bay flex flex-col gap-3 p-5"><h2>Your collection context</h2><p class="m-0 text-[14px] text-ink-2">{{ profile.explanation }}</p><dl v-if="profile.collectionByState.length" class="m-0 flex flex-wrap gap-3"><div v-for="s in profile.collectionByState" :key="s.state" class="min-w-[9rem] rounded-control border border-line px-4 py-3"><dt class="etch">{{ s.state.replaceAll('_',' ') }}</dt><dd class="readout m-0 mt-1 text-[22px] leading-none">{{ String(s.count).padStart(2, '0') }}</dd></div></dl><p v-else class="m-0 text-[14px] text-ink-2">No collection entries recorded.</p></section>
    </template>
    <p v-if="message" role="status" class="m-0 text-[14px] text-ink-2">{{ message }}</p>
  </div>
</template>
