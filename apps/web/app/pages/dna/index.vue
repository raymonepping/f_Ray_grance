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
    <h1>My DNA</h1>
    <p class="m-0 text-ink-2">Your own spring, summer, autumn and winter choices. No daily wear log, and no assumed likes from ownership.</p>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Season">
      <button v-for="s in seasons" :key="s" type="button" :disabled="saving" :aria-pressed="active===s" class="tap rounded-full border px-4 capitalize" :class="active===s?'border-gold bg-sunken font-semibold':'border-line'" @click="active=s">{{ s }}</button>
    </div>
    <StatusBanner v-if="error" tone="error" title="Not saved or unavailable">{{ error }} <button class="underline" type="button" @click="load">Retry</button></StatusBanner>
    <p v-if="loading" role="status">Loading seasonal choices…</p>
    <template v-if="profile">
      <form class="surface-solid flex flex-col gap-4 rounded-card p-4 md:p-5" @submit.prevent="save">
        <h2 class="capitalize">{{ active }} preferences</h2>
        <p class="m-0 text-sm text-ink-2">Unrated means no choice. Neutral is an explicit opinion. Unsure keeps uncertainty visible.</p>
        <fieldset :disabled="saving" class="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <legend class="sr-only">Edit {{ active }} preferences</legend>
          <div class="grid min-w-0 gap-3 sm:grid-cols-2">
            <div class="flex min-w-0 flex-col gap-1"><label for="pref-category">Type</label><select id="pref-category" v-model="category" class="tap rounded-control border border-line bg-sunken px-2"><option v-for="g in groups" :key="g" :value="g">{{ g }}</option></select></div>
            <div class="flex min-w-0 flex-col gap-1"><label for="pref-term">Note, family, accord or trait</label><input id="pref-term" v-model="term" maxlength="80" class="tap min-w-0 rounded-control border border-line bg-sunken px-3" /></div>
            <div class="flex flex-col gap-1"><label for="pref-choice">Your preference</label><select id="pref-choice" v-model="opinion" class="tap rounded-control border border-line bg-sunken px-2"><option value="love">Love</option><option value="neutral">Neutral</option><option value="avoid">Avoid</option><option value="unsure">Unsure</option></select></div>
            <button type="button" :disabled="!term.trim()" class="tap self-end rounded-control border border-line px-4 disabled:opacity-60" @click="add">Add choice</button>
          </div>
          <div v-for="g in groups" :key="g" class="flex flex-col gap-2">
            <h3 class="capitalize">{{ g }}</h3>
            <p v-if="!Object.keys(profile.choices[g]).length" class="m-0 text-sm text-ink-2">Not rated yet.</p>
            <label v-for="(value,name) in profile.choices[g]" :key="name" class="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line py-2">
              <span class="[overflow-wrap:anywhere]">{{ name }}</span><select :value="value" :aria-label="`${g}: ${name}`" class="tap rounded-control border border-line bg-sunken px-2" @change="choose(g,String(name),$event)"><option value="unrated">Not rated</option><option value="love">Love</option><option value="neutral">Neutral</option><option value="avoid">Avoid</option><option value="unsure">Unsure</option></select>
            </label>
          </div>
          <label for="season-note">Private seasonal note</label><textarea id="season-note" v-model="profile.freeText" maxlength="4000" rows="3" class="min-w-0 rounded-control border border-line bg-sunken p-3" />
          <button type="submit" class="tap w-fit rounded-control bg-gold px-4 font-semibold text-gold-ink">{{ saving?'Saving…':'Save this season' }}</button>
        </fieldset>
      </form>
      <section class="surface-solid flex flex-col gap-3 rounded-card p-4" aria-labelledby="season-fragrance-title">
        <h2 id="season-fragrance-title">Fragrances for this season</h2>
        <div class="flex min-w-0 flex-col gap-2"><label for="season-fragrance">Saved fragrance</label><select id="season-fragrance" v-model="selected" class="tap w-full min-w-0 rounded-control border border-line bg-sunken px-2"><option value="">Choose a fragrance</option><option v-for="f in library" :key="f.id" :value="f.id">{{ f.brand }} · {{ f.canonical_name }}</option></select></div>
        <label for="season-affinity">Your seasonal affinity</label><select id="season-affinity" v-model="affinity" class="tap rounded-control border border-line bg-sunken px-2"><option value="love">Love</option><option value="like">Like</option><option value="neutral">Neutral</option><option value="avoid">Avoid</option><option value="unsure">Unsure</option><option value="unrated">Not rated</option></select>
        <button :disabled="!selected||saving" type="button" class="tap w-fit rounded-control border border-line px-4 disabled:opacity-60" @click="associate">Save fragrance choice</button>
        <ul v-if="profile.fragrances.length" class="m-0 pl-5"><li v-for="f in profile.fragrances" :key="f.fragrance_id">{{ f.brand }} · {{ f.canonical_name }}: {{ f.affinity??'Not rated' }}</li></ul>
        <NuxtLink :to="`/discover?season=${active}`">Explore this season</NuxtLink>
      </section>
      <section class="surface-solid rounded-card p-4"><h2>Your collection context</h2><p>{{ profile.explanation }}</p><dl class="m-0 grid grid-cols-2 gap-2"><template v-for="s in profile.collectionByState" :key="s.state"><dt class="capitalize">{{ s.state.replaceAll('_',' ') }}</dt><dd class="m-0 tabular-nums">{{ s.count }}</dd></template></dl><p v-if="!profile.collectionByState.length">No collection entries recorded.</p></section>
    </template>
    <p v-if="message" role="status" class="m-0 text-sm text-ink-2">{{ message }}</p>
  </div>
</template>
