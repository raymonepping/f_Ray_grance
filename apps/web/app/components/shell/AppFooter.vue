<script setup lang="ts">
// Normal document flow, never pinned (DESIGN §4.1). Status shown only when observed.
const version = useRuntimeConfig().public.appVersion;
const { state } = useConnection();
</script>

<template>
  <footer class="mt-auto border-t border-line px-4 pb-[calc(88px+env(safe-area-inset-bottom))] pt-6 text-sm text-ink-3 md:px-6 md:pb-6 xl:px-8">
    <div class="mx-auto flex max-w-[1440px] flex-col items-center gap-3 text-center md:flex-row md:justify-between md:text-left">
      <p class="m-0"><span class="font-semibold text-ink-2">F-Ray-grance</span> v{{ version }}</p>
      <ul class="m-0 flex list-none flex-wrap justify-center gap-4 p-0">
        <li><NuxtLink to="/settings#sources" class="text-ink-3 hover:text-ink">Data sources</NuxtLink></li>
        <li><NuxtLink to="/settings#privacy" class="text-ink-3 hover:text-ink">Privacy &amp; provenance</NuxtLink></li>
      </ul>
      <p class="m-0" data-testid="footer-connection">{{ CONNECTION_LABEL[state] }}</p>
    </div>
  </footer>
</template>
