<script setup lang="ts">
// Channel rail (desktop sidebar >=1200, icon rail 768-1199). The Spectral F leads the rail;
// the active channel carries an ink bar, never the signal colour.
import { PRIMARY_NAV, SECONDARY_NAV, isActive } from '~~/shared/navigation';

const props = defineProps<{ collapsed: boolean; forceRail?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const route = useRoute();
const rail = computed(() => props.collapsed || props.forceRail);
const { state } = useConnection();
const active = (item: (typeof PRIMARY_NAV)[number]) => isActive(item, route.path, route.query);
</script>

<template>
  <aside
    aria-label="Primary"
    class="motion sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-line bg-panel md:flex"
    :style="{ width: rail ? 'var(--rail-w)' : 'var(--sidebar-w)' }"
  >
    <div class="flex h-[var(--header-h)] items-center gap-2 border-b border-line" :class="rail ? 'justify-center px-2' : 'justify-between pl-5 pr-3'">
      <NuxtLink to="/collection" class="flex min-w-0 items-center no-underline" aria-label="F-Ray-grance home">
        <BrandSpectralMark :size="34" title="F-Ray-grance" />
      </NuxtLink>
      <IconButton v-if="!forceRail && !rail" label="Collapse sidebar" icon="collapse" @click="emit('toggle')" />
    </div>


    <nav aria-label="Main" class="flex flex-col gap-0.5 px-3 pt-5">
      <NuxtLink
        v-for="item in PRIMARY_NAV"
        :key="item.to"
        :to="item.to"
        class="motion group relative flex h-10 items-center gap-3 rounded-control px-3 text-[14px] no-underline"
        :class="[active(item) ? 'bg-raised font-medium text-ink' : 'text-ink-2 hover:bg-raised/60 hover:text-ink', rail ? 'justify-center px-0' : '']"
        :aria-current="active(item) ? 'page' : undefined"
        :title="rail ? item.label : undefined"
      >
        <span v-if="active(item)" class="absolute inset-y-2.5 left-0 w-[2px] rounded-full bg-ink" aria-hidden="true" />
        <AppIcon :name="item.icon" :size="18" />
        <span :class="rail ? 'sr-only' : 'flex-1'">{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="mt-auto flex flex-col gap-0.5 px-3 pb-3 pt-6">
      <NuxtLink
        v-for="item in SECONDARY_NAV"
        :key="item.to"
        :to="item.to"
        class="motion relative flex h-10 items-center gap-3 rounded-control px-3 text-[14px] no-underline"
        :class="[active(item) ? 'bg-raised font-medium text-ink' : 'text-ink-2 hover:bg-raised/60 hover:text-ink', rail ? 'justify-center px-0' : '']"
        :aria-current="active(item) ? 'page' : undefined"
        :title="rail ? item.label : undefined"
      >
        <span v-if="active(item)" class="absolute inset-y-2.5 left-0 w-[2px] rounded-full bg-ink" aria-hidden="true" />
        <AppIcon :name="item.icon" :size="18" />
        <span :class="rail ? 'sr-only' : ''">{{ item.label }}</span>
      </NuxtLink>
      <IconButton v-if="!forceRail && rail" label="Expand sidebar" icon="expand" class="self-center" @click="emit('toggle')" />
      <div v-if="!rail" class="well mt-3 flex items-center gap-2.5 px-3 py-2.5" data-testid="sidebar-connection">
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="state === 'unreachable' ? 'bg-bad' : state === 'degraded' ? 'bg-warn' : 'signal-dot'"
          aria-hidden="true"
        />
        <span class="min-w-0 truncate text-[12px] text-ink-2">{{ CONNECTION_LABEL[state] }}</span>
      </div>
    </div>
  </aside>
</template>
