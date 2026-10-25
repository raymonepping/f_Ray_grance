<script setup lang="ts">
// ⌘K / Ctrl+K search entry (DESIGN §8). Hands the query to Discover, where exact /
// review / unresolved states are shown; nothing is auto-merged from here.
const open = defineModel<boolean>({ required: true });
const q = ref('');
const input = ref<HTMLInputElement | null>(null);
let restoreTo: HTMLElement | null = null;

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    open.value = !open.value;
  } else if (open.value && e.key === 'Escape') {
    open.value = false;
  }
}
watch(open, async (v) => {
  if (v) {
    restoreTo = document.activeElement as HTMLElement | null;
    await nextTick();
    input.value?.focus();
  } else restoreTo?.focus();
});
function submit() {
  const term = q.value.trim();
  if (!term) return;
  open.value = false;
  navigateTo({ path: '/discover', query: { q: term } });
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div class="absolute inset-0 bg-black/60" aria-hidden="true" @click="open = false" />
      <form role="dialog" aria-modal="true" aria-label="Search fragrances" class="bay relative w-full max-w-xl rounded-card p-2 shadow-[var(--shadow-2)]" @submit.prevent="submit">
        <label for="global-search" class="sr-only">Brand and fragrance name, or barcode digits</label>
        <div class="flex items-center gap-2">
          <AppIcon name="search" class="ml-2 text-ink-3" />
          <input
            id="global-search"
            ref="input"
            v-model="q"
            type="search"
            autocomplete="off"
            enterkeyhint="search"
            placeholder="e.g. Rabanne Phantom in Red, or an EAN"
            class="tap w-full rounded-control border-0 bg-transparent px-2 text-base text-ink placeholder:text-ink-3 focus-visible:outline-none"
          />
          <button type="submit" class="btn btn-primary">Search</button>
        </div>
        <p class="m-0 mt-1 border-t border-line px-3 pb-1 pt-2 text-[12px] text-ink-3">Exact matches are verified before anything is added. Press Esc to close.</p>
      </form>
    </div>
  </Teleport>
</template>
