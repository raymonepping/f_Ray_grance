<script setup lang="ts">
// Sticky header within the content column (DESIGN §4.1). One primary action per view,
// provided by the page via the `action` prop.
const props = defineProps<{ title: string; crumbs?: { label: string; to?: string }[]; action?: { label: string; to: string } }>();
const emit = defineEmits<{ search: []; menu: [] }>();
const scrolled = ref(false);
const onScroll = () => (scrolled.value = window.scrollY > 4);
onMounted(() => {
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));
void props;
</script>

<template>
  <header
    class="motion sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-2 border-b px-4 md:px-6 xl:px-8"
    :class="scrolled ? 'glass-strong rounded-none border-x-0 border-t-0' : 'glass rounded-none border-x-0 border-t-0'"
  >
    <IconButton class="md:hidden" label="Open menu" icon="menu" aria-haspopup="dialog" @click="emit('menu')" />
    <nav v-if="crumbs?.length" aria-label="Breadcrumb" class="hidden min-w-0 lg:block">
      <ol class="m-0 flex list-none items-center gap-2 p-0 text-sm text-ink-2">
        <li v-for="(c, i) in crumbs" :key="i" class="flex min-w-0 items-center gap-2">
          <NuxtLink v-if="c.to" :to="c.to" class="truncate text-ink-2 no-underline hover:text-ink">{{ c.label }}</NuxtLink>
          <span v-else class="truncate font-semibold text-ink" aria-current="page">{{ c.label }}</span>
          <span v-if="i < crumbs.length - 1" aria-hidden="true">/</span>
        </li>
      </ol>
    </nav>
    <p class="m-0 min-w-0 truncate font-semibold" :class="crumbs?.length ? 'lg:hidden' : ''">{{ title }}</p>
    <div class="ml-auto flex items-center gap-1">
      <IconButton label="Search fragrances" icon="search" @click="emit('search')" />
      <NuxtLink
        v-if="action"
        :to="action.to"
        class="tap motion inline-flex items-center gap-2 rounded-control bg-gold px-3 font-semibold text-gold-ink no-underline hover:brightness-110 sm:px-4"
      >
        <AppIcon name="plus" :size="18" />
        <span class="hidden sm:inline">{{ action.label }}</span>
        <span class="sr-only sm:hidden">{{ action.label }}</span>
      </NuxtLink>
      <span class="hidden md:inline-flex"><ShellThemeToggle /></span>
    </div>
  </header>
</template>
