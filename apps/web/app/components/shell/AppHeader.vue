<script setup lang="ts">
// Sticky header within the content column. The only translucent surface in the app.
// One primary action per view, provided by the page via the `action` prop.
defineProps<{ title: string; crumbs?: { label: string; to?: string }[]; action?: { label: string; to: string } }>();
const emit = defineEmits<{ search: []; menu: [] }>();
const isMac = computed(() => import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform));
</script>

<template>
  <header class="chrome sticky top-0 z-30 flex h-[var(--header-h)] items-center gap-2 border-b border-line px-3 md:px-6 xl:px-8">
    <IconButton class="md:hidden" label="Open menu" icon="menu" aria-haspopup="dialog" @click="emit('menu')" />
    <NuxtLink to="/collection" class="flex items-center no-underline md:hidden" aria-label="F-Ray-grance home">
      <BrandSpectralMark :size="26" title="F-Ray-grance" />
    </NuxtLink>
    <nav v-if="crumbs?.length" aria-label="Breadcrumb" class="hidden min-w-0 lg:block">
      <ol class="m-0 flex list-none items-center gap-2 p-0 text-[13px] text-ink-3">
        <li v-for="(c, i) in crumbs" :key="i" class="flex min-w-0 items-center gap-2">
          <NuxtLink v-if="c.to" :to="c.to" class="truncate text-ink-3 no-underline hover:text-ink">{{ c.label }}</NuxtLink>
          <span v-else class="truncate font-medium text-ink" aria-current="page">{{ c.label }}</span>
          <span v-if="i < crumbs.length - 1" class="readout text-ink-3" aria-hidden="true">/</span>
        </li>
      </ol>
    </nav>
    <p class="m-0 min-w-0 truncate pl-1 text-[14px] font-medium" :class="crumbs?.length ? 'lg:hidden' : ''">{{ title }}</p>
    <div class="ml-auto flex items-center gap-1.5">
      <IconButton class="md:hidden" label="Search fragrances" icon="search" @click="emit('search')" />
      <button
        type="button"
        class="motion hidden h-9 w-56 items-center gap-2.5 rounded-control border border-line bg-sunken px-3 text-left text-[13px] text-ink-3 hover:border-line-strong hover:text-ink md:flex lg:w-72"
        aria-label="Search fragrances"
        @click="emit('search')"
      >
        <AppIcon name="search" :size="16" />
        <span class="flex-1">Search fragrances</span>
        <kbd class="readout rounded border border-line px-1.5 text-[11px]">{{ isMac ? '⌘K' : 'Ctrl K' }}</kbd>
      </button>
      <span class="hidden md:inline-flex"><ShellThemeToggle /></span>
      <NuxtLink v-if="action" :to="action.to" class="btn btn-primary h-9 min-h-0 px-3 sm:px-3.5">
        <AppIcon name="plus" :size="16" />
        <span class="hidden sm:inline">{{ action.label }}</span>
        <span class="sr-only sm:hidden">{{ action.label }}</span>
      </NuxtLink>
    </div>
  </header>
</template>
