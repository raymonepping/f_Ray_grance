<script setup lang="ts">
import { PRIMARY_NAV, SECONDARY_NAV, isActive } from '~~/shared/navigation';

const props = defineProps<{ collapsed: boolean; forceRail?: boolean }>();
const emit = defineEmits<{ toggle: []; search: [] }>();
const route = useRoute();
const rail = computed(() => props.collapsed || props.forceRail);
const { state } = useConnection();
const isMac = computed(() => import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform));
</script>

<template>
  <aside
    aria-label="Primary"
    class="glass motion sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto rounded-none border-y-0 border-l-0 md:flex"
    :style="{ width: rail ? 'var(--rail-w)' : 'var(--sidebar-w)' }"
  >
    <div class="flex h-[var(--header-h)] items-center gap-2 px-3" :class="rail ? 'justify-center' : 'justify-between'">
      <NuxtLink to="/collection" class="flex min-w-0 items-center gap-2 no-underline" aria-label="F-Ray-grance home">
        <span class="grid size-9 place-items-center rounded-control bg-gold font-bold text-gold-ink" aria-hidden="true">F</span>
        <span v-if="!rail" class="truncate text-[15px] font-semibold tracking-[0.12em] text-ink">F-RAY-GRANCE</span>
      </NuxtLink>
      <IconButton v-if="!forceRail && !rail" label="Collapse sidebar" icon="collapse" @click="emit('toggle')" />
    </div>

    <div class="px-3 pb-3">
      <button
        type="button"
        class="tap motion flex w-full items-center gap-3 rounded-control border border-line px-3 text-left text-ink-2 hover:border-line-strong hover:text-ink"
        :class="rail ? 'justify-center' : ''"
        aria-label="Search fragrances"
        @click="emit('search')"
      >
        <AppIcon name="search" />
        <span v-if="!rail" class="flex-1">Search</span>
        <kbd v-if="!rail" class="rounded border border-line px-1.5 text-xs text-ink-3">{{ isMac ? '⌘K' : 'Ctrl K' }}</kbd>
      </button>
    </div>

    <nav aria-label="Main" class="flex flex-col gap-1 px-3">
      <NuxtLink
        v-for="item in PRIMARY_NAV"
        :key="item.to"
        :to="item.to"
        class="tap motion relative flex items-center gap-3 rounded-control px-3 no-underline"
        :class="[isActive(item, route.path, route.query) ? 'bg-sunken font-semibold text-ink' : 'text-ink-2 hover:bg-sunken/60 hover:text-ink', rail ? 'justify-center' : '']"
        :aria-current="isActive(item, route.path, route.query) ? 'page' : undefined"
        :title="rail ? item.label : undefined"
      >
        <span v-if="isActive(item, route.path, route.query)" class="absolute inset-y-2 left-0 w-1 rounded-full bg-gold" aria-hidden="true" />
        <AppIcon :name="item.icon" :class="isActive(item, route.path, route.query) ? 'text-gold' : ''" />
        <span :class="rail ? 'sr-only' : ''">{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="mt-auto flex flex-col gap-1 border-t border-line px-3 py-3">
      <NuxtLink
        v-for="item in SECONDARY_NAV"
        :key="item.to"
        :to="item.to"
        class="tap motion flex items-center gap-3 rounded-control px-3 text-ink-2 no-underline hover:bg-sunken/60 hover:text-ink"
        :class="[isActive(item, route.path, route.query) ? 'bg-sunken font-semibold text-ink' : '', rail ? 'justify-center' : '']"
        :aria-current="isActive(item, route.path, route.query) ? 'page' : undefined"
        :title="rail ? item.label : undefined"
      >
        <AppIcon :name="item.icon" />
        <span :class="rail ? 'sr-only' : ''">{{ item.label }}</span>
      </NuxtLink>
      <IconButton v-if="!forceRail && rail" label="Expand sidebar" icon="expand" class="self-center" @click="emit('toggle')" />
      <p v-if="!rail" class="m-0 mt-2 flex items-center gap-2 px-3 text-xs text-ink-3" data-testid="sidebar-connection">
        <span class="size-2 rounded-full" :class="state === 'unreachable' ? 'bg-bad' : state === 'degraded' ? 'bg-warn' : 'bg-ok'" aria-hidden="true" />
        {{ CONNECTION_LABEL[state] }}
      </p>
    </div>
  </aside>
</template>
