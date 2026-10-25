<script setup lang="ts">
// Unobtrusive "Explain this" link into the matching original Academy lesson. Lesson slugs
// mirror the API's EXPLAIN map (apps/api/src/domain/academy.ts).
const LESSON = {
  pyramid: { slug: 'pyramid-drydown', topic: 'the note pyramid and drydown' },
  family: { slug: 'families', topic: 'fragrance families' },
  traits: { slug: 'descriptors', topic: 'scent descriptors' },
  concentration: { slug: 'concentration-performance', topic: 'concentration, projection and sillage' },
  notes: { slug: 'material-note-accord', topic: 'materials, notes and accords' },
} as const;
const props = defineProps<{ concept: keyof typeof LESSON }>();
const l = computed(() => LESSON[props.concept]);
</script>

<template>
  <NuxtLink
    :to="`/academy/lessons/${l.slug}`"
    class="motion inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-ink-3 no-underline hover:bg-raised hover:text-ink pointer-coarse:h-11"
    :aria-label="`Explain this: ${l.topic}`"
    data-testid="explain-this"
  >
    <AppIcon name="academy" :size="14" /> Explain this
  </NuxtLink>
</template>
