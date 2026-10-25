<script setup lang="ts">
import { PRIMARY_NAV, isActive } from '~~/shared/navigation';
const route = useRoute();
const active = (item: (typeof PRIMARY_NAV)[number]) => isActive(item, route.path, route.query);
</script>

<template>
  <nav aria-label="Main" class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
    <ul class="m-0 grid list-none grid-cols-4 p-0">
      <li v-for="item in PRIMARY_NAV" :key="item.to">
        <NuxtLink
          :to="item.to"
          class="motion relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 text-[11px] no-underline"
          :class="active(item) ? 'font-medium text-ink' : 'text-ink-3'"
          :aria-current="active(item) ? 'page' : undefined"
        >
          <span v-if="active(item)" class="absolute inset-x-6 top-0 h-[2px] rounded-full bg-ink" aria-hidden="true" />
          <AppIcon :name="item.icon" :size="20" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
