<script setup lang="ts">
import { PRIMARY_NAV, isActive } from '~~/shared/navigation';
const route = useRoute();
</script>

<template>
  <nav aria-label="Main" class="glass fixed inset-x-0 bottom-0 z-40 rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden">
    <ul class="m-0 grid list-none grid-cols-4 p-0">
      <li v-for="item in PRIMARY_NAV" :key="item.to">
        <NuxtLink
          :to="item.to"
          class="motion flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 text-xs no-underline"
          :class="isActive(item, route.path, route.query) ? 'font-semibold text-ink' : 'text-ink-2'"
          :aria-current="isActive(item, route.path, route.query) ? 'page' : undefined"
        >
          <AppIcon :name="item.icon" :class="isActive(item, route.path, route.query) ? 'text-gold' : ''" />
          <span>{{ item.label }}</span>
          <span v-if="isActive(item, route.path, route.query)" class="h-0.5 w-6 rounded-full bg-gold" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
