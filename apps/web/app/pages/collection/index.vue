<script setup lang="ts">
import { CONCENTRATION_LABEL, STATE_LABEL, type CollectionState, type Pyramid } from '~~/shared/types';

usePageHeader({ title: 'My Collection', action: { label: 'Add fragrance', to: '/discover' } });
interface Entry {
  id: string;
  fragrance_id: string;
  state: CollectionState;
  brand: string;
  canonical_name: string;
  concentration: string | null;
  identity_status: string;
  pyramid?: Pyramid | null;
  rating: number | null;
  primary_image_id?: string | null;
}
const route = useRoute();
const compareSelection = useCompare();
const filters = [{ key: 'all', label: 'All' }, ...(Object.keys(STATE_LABEL) as CollectionState[]).map((k) => ({ key: k, label: k === 'sampled' ? 'Samples' : STATE_LABEL[k] }))];
const active = computed(() => (typeof route.query.state === 'string' ? route.query.state : 'all'));
const q = ref(typeof route.query.q === 'string' ? route.query.q : '');
const sort = ref(typeof route.query.sort === 'string' ? route.query.sort : 'recent');
const season = ref(typeof route.query.season === 'string' ? route.query.season : '');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 300); // debounce
});
watch(sort, load);
watch(season, load);
const items = ref<Entry[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
let requestVersion = 0;
onBeforeUnmount(() => { clearTimeout(timer); requestVersion++; });
async function load() {
  const version = ++requestVersion;
  loading.value = true;
  error.value = null;
  try {
    const params = new URLSearchParams();
    if (active.value !== 'all') params.set('state', active.value);
    if (q.value.trim()) params.set('q', q.value.trim());
    params.set('sort', sort.value);
    if(season.value) params.set('season',season.value);
    const result = await apiFetch<{ items: Entry[] }>(`/api/v1/collection?${params}`);
    if (version === requestVersion) items.value = result.items;
  } catch (e) {
    if (version === requestVersion) error.value = e instanceof ApiFailure ? e.message : 'Could not load your collection';
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}
watch(active, load, { immediate: true });
const owned = computed(() => items.value.filter((i) => i.state === 'owned').length);
const verified = computed(() => items.value.filter((i) => i.identity_status === 'verified').length);
const conc = (c: string | null) => (c ? CONCENTRATION_LABEL[c] ?? c : null);
const pad = (n: number) => String(n).padStart(2, '0');
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <h1>My Collection</h1>
        <p class="m-0 mt-2 text-[14px] text-ink-2" data-testid="owned-count">
          <template v-if="!loading && !error">{{ active === 'all' ? `${owned} owned · ${items.length} total` : `${items.length} shown` }}</template>
        </p>
      </div>
      <dl v-if="!loading && !error && items.length" class="readout m-0 hidden gap-6 text-right sm:flex" aria-label="Collection readout">
        <div><dt class="etch">Entries</dt><dd class="m-0 mt-1 text-[22px] leading-none text-ink">{{ pad(items.length) }}</dd></div>
        <div><dt class="etch">Owned</dt><dd class="m-0 mt-1 text-[22px] leading-none text-ink">{{ pad(owned) }}</dd></div>
        <div><dt class="etch">Verified</dt><dd class="m-0 mt-1 text-[22px] leading-none text-signal-text">{{ pad(verified) }}</dd></div>
      </dl>
    </div>

    <section class="bay overflow-hidden" aria-label="Collection">
      <div class="flex flex-col gap-3 border-b border-line p-3 md:p-4">
        <div class="grid grid-cols-2 items-end gap-3 md:grid-cols-[minmax(0,1fr)_11rem_12rem]">
          <div class="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
            <label for="collection-search" class="text-[13px] font-medium text-ink-2">Search your collection</label>
            <input id="collection-search" v-model="q" type="search" placeholder="Brand, name or barcode" class="field" />
          </div>
          <div class="flex min-w-0 flex-col gap-1.5">
            <label for="collection-season" class="text-[13px] font-medium text-ink-2">Personal season</label>
            <select id="collection-season" v-model="season" class="field capitalize"><option value="">All seasons</option><option v-for="s in ['spring','summer','autumn','winter']" :key="s" :value="s">{{ s }}</option></select>
          </div>
          <div class="flex min-w-0 flex-col gap-1.5">
            <label for="collection-sort" class="text-[13px] font-medium text-ink-2">Sort</label>
            <select id="collection-sort" v-model="sort" class="field">
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="brand">Brand</option>
              <option value="rating">Your rating</option>
            </select>
          </div>
        </div>
        <nav aria-label="Collection status">
          <ul class="m-0 flex w-fit max-w-full list-none flex-wrap gap-1 rounded-control border border-line bg-sunken p-1">
            <li v-for="f in filters" :key="f.key">
              <NuxtLink
                :to="f.key === 'all' ? '/collection' : `/collection?state=${f.key}`"
                class="motion inline-flex h-8 items-center whitespace-nowrap rounded-[6px] px-3 text-[13px] no-underline pointer-coarse:h-11"
                :class="active === f.key ? 'bg-raised font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink'"
                :aria-current="active === f.key ? 'true' : undefined"
              >{{ f.label }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>

      <div v-if="error" class="p-4">
        <StatusBanner tone="error" title="Collection unavailable">{{ error }}. Your saved data is not affected. <button class="underline" type="button" @click="load">Retry</button></StatusBanner>
      </div>
      <div v-else-if="loading" class="flex flex-col" aria-busy="true" aria-label="Loading collection">
        <div v-for="n in 4" :key="n" class="flex h-[68px] items-center gap-4 border-b border-line px-4 last:border-b-0">
          <div class="h-3 w-40 animate-pulse rounded bg-raised" /><div class="ml-auto h-6 w-32 animate-pulse rounded bg-raised" />
        </div>
      </div>
      <div v-else-if="items.length === 0" class="p-4 md:p-8">
        <EmptyState v-if="q.trim()" icon="search" title="No matches" body="Nothing in this view matches your search. Try a brand, a name or a barcode." />
        <EmptyState
          v-else-if="active === 'all'"
          icon="library"
          title="Start your collection"
          body="Search, verify, add. Find an exact fragrance, check its sourced notes, then record whether you own it, sampled it, want it or passed on it."
          action-label="Find a fragrance"
          action-to="/discover"
        />
        <EmptyState v-else icon="library" :title="`No ${filters.find((f) => f.key === active)?.label.toLowerCase()} yet`" body="Nothing is recorded in this status. History in other statuses is kept." />
      </div>
      <template v-else>
        <div class="etch ruler hidden grid-cols-[minmax(0,1fr)_132px_9rem_4rem_7.5rem_6.5rem] items-center gap-6 border-b border-line bg-sunken/60 px-4 py-2.5 md:grid" aria-hidden="true">
          <span>Fragrance</span><span>Note profile</span><span>Status</span><span>Rating</span><span>Identity</span><span class="text-right">Compare</span>
        </div>
        <ul class="m-0 list-none p-0" aria-label="Collection entries">
          <li
            v-for="e in items"
            :key="e.id"
            class="motion group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3.5 last:border-b-0 hover:bg-raised/50 md:grid-cols-[minmax(0,1fr)_132px_9rem_4rem_7.5rem_6.5rem] md:gap-6"
          >
            <div class="order-1 flex min-w-0 items-start gap-3 md:order-none">
              <FragranceImage :image-id="e.primary_image_id" :alt="`${e.brand} ${e.canonical_name}`" size="thumb" />
              <div class="min-w-0">
              <NuxtLink :to="`/fragrances/${e.fragrance_id}`" class="block text-[15px] font-medium leading-snug text-ink no-underline after:absolute after:inset-0 after:content-[''] [overflow-wrap:anywhere]">
                {{ e.canonical_name }}
              </NuxtLink>
              <p class="m-0 mt-0.5 text-[13px] text-ink-3">
                {{ e.brand }}<template v-if="conc(e.concentration)"> · {{ conc(e.concentration) }}</template>
              </p>
              <p class="m-0 mt-1.5 flex items-center gap-3 md:hidden">
                <FragranceIdentityMark :status="e.identity_status" />
                <span class="readout text-[12px] text-ink-3" :aria-label="e.rating ? `Rating ${e.rating} out of 5` : 'Not rated'">{{ e.rating ? `${e.rating}/5` : '—' }}</span>
              </p>
              </div>
            </div>
            <FragranceChromatogram :pyramid="e.pyramid" micro :label="`${e.canonical_name} note profile`" class="order-3 md:order-none" />
            <FragranceCollectionStatusBadge :state="e.state" class="order-2 justify-self-end md:order-none md:justify-self-start" />
            <span class="readout hidden text-[13px] md:block" :class="e.rating ? 'text-ink' : 'text-ink-3'" :aria-label="e.rating ? `Rating ${e.rating} out of 5` : 'Not rated'">{{ e.rating ? `${e.rating}/5` : '—' }}</span>
            <div class="hidden md:block"><FragranceIdentityMark :status="e.identity_status" /></div>
            <div class="relative z-10 order-4 flex justify-end md:order-none">
              <button
                v-if="e.identity_status === 'verified'"
                type="button"
                class="btn btn-ghost h-8 min-h-0 px-2.5 text-[13px]"
                :aria-label="`Add ${e.canonical_name} to Compare`"
                :aria-pressed="compareSelection.ids.value.includes(e.fragrance_id)"
                @click="compareSelection.add(e.fragrance_id)"
              >
                <AppIcon :name="compareSelection.ids.value.includes(e.fragrance_id) ? 'check' : 'columns'" :size="15" />
                {{ compareSelection.ids.value.includes(e.fragrance_id) ? 'Added' : 'Add' }}
              </button>
            </div>
          </li>
        </ul>
      </template>
    </section>
    <p v-if="!loading && !error && items.length" class="m-0 text-[12px] text-ink-3">Note profile: one peak per listed note in top, heart and base. Peak height follows listed order, not concentration.</p>
  </div>
</template>
