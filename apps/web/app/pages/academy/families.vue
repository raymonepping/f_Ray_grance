<script setup lang="ts">
// Family explorer: the Scento family map, then one family's detail on request.
usePageHeader({ title: 'Family explorer', crumbs: [{ label: 'Academy', to: '/academy' }, { label: 'Family explorer' }] });
useHead({ title: 'Family explorer · Scent Academy' });
const picked = ref('');
const detail = ref<{ lookup: (t?: string) => Promise<void> } | null>(null);
async function pick(id: string) {
  picked.value = id;
  await nextTick();
  await detail.value?.lookup(id);
  document.getElementById('family-detail')?.scrollIntoView({ block: 'start' });
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1>Family explorer</h1>
      <p class="m-0 mt-2 max-w-[60ch] text-[15px] text-ink-2">Families are flexible maps, and sources draw them differently. This is Scento's map; choose a family to read its detail.</p>
    </div>
    <div class="grid gap-5 xl:grid-cols-2">
      <section aria-label="Family map"><AcademyReferenceLookup kind="families" label="Family map" auto @pick="pick" /></section>
      <section id="family-detail" class="scroll-mt-24" aria-label="Family detail">
        <AcademyReferenceLookup v-if="picked" ref="detail" kind="family" label="Family" :initial="picked" />
        <div v-else class="bay flex flex-col gap-3 p-5">
          <h2 class="text-[15px]">How to read a family</h2>
          <p class="m-0 text-[13px] text-ink-2">Compare what leads the opening with what remains later. One fragrance can sit between two families.</p>
          <AcademyExplainLink concept="family" class="self-start" />
        </div>
      </section>
    </div>
  </div>
</template>
