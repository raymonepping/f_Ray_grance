<script setup lang="ts">
import { STATE_LABEL, type CollectionState } from '~~/shared/types';

usePageHeader({ title: 'My Collection', action: { label: 'Add fragrance', to: '/discover' } });
interface Entry {
  id: string;
  fragrance_id: string;
  state: CollectionState;
  brand: string;
  canonical_name: string;
  concentration: string | null;
  identity_status: string;
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
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>My Collection</h1>
        <p class="m-0 mt-1 text-ink-2" data-testid="owned-count">
          <template v-if="!loading && !error">{{ active === 'all' ? `${owned} owned · ${items.length} total` : `${items.length} shown` }}</template>
        </p>
      </div>
    </div>
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <label for="collection-search" class="text-sm font-semibold">Search your collection</label>
        <input id="collection-search" v-model="q" type="search" placeholder="Brand, name or barcode" class="tap rounded-control border border-line bg-solid px-3 text-ink placeholder:text-ink-3" />
      </div>
      <div class="flex flex-col gap-1">
        <label for="collection-season" class="text-sm font-semibold">Personal season</label>
        <select id="collection-season" v-model="season" class="tap rounded-control border border-line bg-solid px-3 text-ink"><option value="">All seasons</option><option v-for="s in ['spring','summer','autumn','winter']" :key="s" :value="s">{{ s }}</option></select>
      </div>
      <div class="flex flex-col gap-1">
        <label for="collection-sort" class="text-sm font-semibold">Sort</label>
        <select id="collection-sort" v-model="sort" class="tap rounded-control border border-line bg-solid px-3 text-ink">
          <option value="recent">Recently changed</option>
          <option value="name">Name</option>
          <option value="brand">Brand</option>
          <option value="rating">Your rating</option>
        </select>
      </div>
    </div>
    <nav aria-label="Collection status">
      <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
        <li v-for="f in filters" :key="f.key">
          <NuxtLink
            :to="f.key === 'all' ? '/collection' : `/collection?state=${f.key}`"
            class="tap motion inline-flex items-center whitespace-nowrap rounded-full border px-4 text-sm no-underline"
            :class="active === f.key ? 'border-gold bg-sunken font-semibold text-ink' : 'border-line text-ink-2 hover:text-ink'"
            :aria-current="active === f.key ? 'true' : undefined"
          >{{ f.label }}</NuxtLink>
        </li>
      </ul>
    </nav>
    <StatusBanner v-if="error" tone="error" title="Collection unavailable">{{ error }}. Your saved data is not affected. <button class="underline" type="button" @click="load">Retry</button></StatusBanner>
    <div v-else-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-busy="true" aria-label="Loading collection">
      <div v-for="n in 4" :key="n" class="surface-solid h-64 rounded-card opacity-60" />
    </div>
    <EmptyState v-else-if="items.length === 0 && q.trim()" icon="search" title="No matches" body="Nothing in this view matches your search. Try a brand, a name or a barcode." />
    <EmptyState
      v-else-if="items.length === 0 && active === 'all'"
      icon="library"
      title="Start your collection"
      body="Search → Verify → Add. Find an exact fragrance, check its sourced notes, then record whether you own it, sampled it, want it or passed on it."
      action-label="Find a fragrance"
      action-to="/discover"
    />
    <EmptyState v-else-if="items.length === 0" icon="library" :title="`No ${filters.find((f) => f.key === active)?.label.toLowerCase()} yet`" body="Nothing is recorded in this status. History in other statuses is kept." />
    <ul v-else class="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <li v-for="e in items" :key="e.id">
        <FragranceCard :id="e.fragrance_id" :brand="e.brand" :name="e.canonical_name" :concentration="e.concentration" :state="e.state" :identity-status="e.identity_status" />
        <button v-if="e.identity_status === 'verified'" type="button" class="tap mt-2 w-full rounded-control border border-line px-3" :aria-label="`Add ${e.canonical_name} to Compare`" @click="compareSelection.add(e.fragrance_id)">Add to Compare</button>
      </li>
    </ul>
  </div>
</template>
