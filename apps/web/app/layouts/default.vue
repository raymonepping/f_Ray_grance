<script setup lang="ts">
// AppShell (DESIGN §4): desktop sidebar ≥1200, rail 768–1199, bottom nav + drawer < 768.
const { prefs, set } = usePreferences();
const header = usePageHeader();
const { status } = useSession();
const conn = useConnection();
const drawer = ref(false);
const search = ref(false);
// Tablet range (768–1199) forces the icon rail. Read synchronously (SPA) so the first
// paint is already correct — no 260→76 px animation on load.
const rail = ref(import.meta.client ? window.innerWidth < 1200 : false);
const route = useRoute();
const announce = ref('');
const compareSelection = useCompare();

function measure() {
  rail.value = window.innerWidth < 1200;
}
onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
  void conn.probe();
});
onBeforeUnmount(() => window.removeEventListener('resize', measure));
// Announce route changes for screen readers.
watch(() => route.fullPath, () => nextTick(() => (announce.value = `${header.value.title} page`)));
</script>

<template>
  <div class="flex min-h-dvh">
    <a href="#main" class="sr-only-focusable fixed left-1/2 top-2 z-[60] -translate-x-1/2 rounded-control bg-action px-4 py-2 font-semibold text-action-ink">Skip to content</a>
    <ShellAppSidebar :collapsed="prefs.sidebarCollapsed" :force-rail="rail" @toggle="set('sidebarCollapsed', !prefs.sidebarCollapsed)" />
    <div class="flex min-w-0 flex-1 flex-col">
      <ShellAppHeader :title="header.title" :crumbs="header.crumbs" :action="header.action" @search="search = true" @menu="drawer = true" />
      <div class="px-4 pt-4 md:px-6 xl:px-8">
        <div class="mx-auto flex max-w-[1440px] flex-col gap-3">
          <StatusBanner v-if="conn.state.value === 'unreachable'" tone="error" title="Mac unreachable">
            F-Ray-grance runs on your Mac. It may be asleep or off the network; nothing you saved is lost. Retry when it is back.
          </StatusBanner>
          <StatusBanner v-else-if="conn.state.value === 'degraded' && conn.degradedSource.value === 'database'" tone="warning" title="Reconnecting to the database">
            This usually happens right after your Mac wakes from sleep and clears by itself within a few minutes; nothing you saved is lost.
            This message disappears when the connection is back. To fix it at once, run <code class="readout">make heal</code> on the Mac.
          </StatusBanner>
          <StatusBanner v-else-if="conn.state.value === 'degraded'" tone="warning" title="Partly unavailable">
            Enrichment is temporarily unavailable. Stored fragrances stay readable.
          </StatusBanner>
        </div>
      </div>
      <main id="main" tabindex="-1" class="w-full flex-1 px-4 py-6 focus:outline-none md:px-6 xl:px-8">
        <div class="mx-auto max-w-[1440px]">
          <slot />
        </div>
      </main>
      <ShellAppFooter />
      <div v-if="compareSelection.ids.value.length" class="h-20" aria-hidden="true" />
    </div>
    <ShellMobileNav />
    <CompareTray />
    <ShellMobileDrawer v-model="drawer" />
    <ShellGlobalSearch v-model="search" />
    <AuthSessionExpired v-if="status === 'expired'" />
    <p class="sr-only" aria-live="polite">{{ announce }}</p>
  </div>
</template>
