<script setup lang="ts">
// Notes a source lists without assigning top, heart or base. Shown as a plain list with that caveat:
// they are never placed into a tier or drawn as chromatogram peaks.
withDefaults(defineProps<{ notes: string[]; materials?: string[]; source?: string }>(), { materials: () => [], source: 'The source' });
</script>

<template>
  <section v-if="notes.length || materials.length" class="flex flex-col gap-3" aria-label="Listed notes">
    <div v-if="notes.length">
      <h3 class="text-[15px]">Listed notes</h3>
      <p class="m-0 mt-0.5 text-[12px] text-ink-3">{{ source }} lists these without top, heart or base tiers.</p>
      <ul class="m-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0" aria-label="Listed notes without tiers" data-testid="listed-notes">
        <li v-for="n in notes" :key="n" class="rounded-[6px] border border-line bg-sunken px-2.5 py-1 text-[13px] [overflow-wrap:anywhere]">{{ n }}</li>
      </ul>
    </div>
    <p v-if="materials.length" class="m-0 text-[13px] text-ink-2"><span class="text-ink-3">Signature materials:</span> {{ materials.join(', ') }}</p>
  </section>
</template>
