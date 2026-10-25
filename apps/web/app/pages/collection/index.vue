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
const filters = [{ key: 'all', label: 'All' }, ...(Object.keys(STATE_LABEL) as CollectionState[]).map((k) => ({ key: k, label: k === 'sampled' ? 'Samples' : STATE_LABEL[k] }))];
const active = computed(() => (typeof route.query.state === 'string' ? route.query.state : 'all'));
const items = ref<Entry[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
async function load() {
  loading.value = true;
  error.value = null;
  try {
    const q = active.value === 'all' ? '' : `?state=${encodeURIComponent(active.value)}`;
    items.value = (await apiFetch<{ items: Entry[] }>(`/api/v1/collection${q}`)).items;
  } catch (e) {
    error.value = e instanceof ApiFailure ? e.message : 'Could not load your collection';
  } finally {
    loading.value = false;
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
        <FragranceFragranceCard :id="e.fragrance_id" :brand="e.brand" :name="e.canonical_name" :concentration="e.concentration" :state="e.state" :identity-status="e.identity_status" />
      </li>
    </ul>
  </div>
</template>
