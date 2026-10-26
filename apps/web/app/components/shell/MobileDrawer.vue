<script setup lang="ts">
// Accessible drawer (DESIGN §4.3): focus trap, Escape, backdrop close, scroll lock,
// focus restored to the trigger.
import { MAIN_GROUPS, UTILITY_NAV, isActive } from '~~/shared/navigation';

const open = defineModel<boolean>({ required: true });
const route = useRoute();
const panel = ref<HTMLElement | null>(null);
const { owner, logout } = useSession();
async function signOut() {
  await logout();
  await navigateTo('/login');
}
let restoreTo: HTMLElement | null = null;

function focusables(): HTMLElement[] {
  return Array.from(panel.value?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? []);
}
function onKey(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    open.value = false;
  } else if (e.key === 'Tab') {
    const f = focusables();
    if (!f.length) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
watch(open, async (v) => {
  if (v) {
    restoreTo = document.activeElement as HTMLElement | null;
    document.documentElement.style.overflow = 'hidden';
    await nextTick();
    focusables()[0]?.focus();
  } else {
    document.documentElement.style.overflow = '';
    restoreTo?.focus();
  }
});
watch(() => route.fullPath, () => (open.value = false));
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  document.documentElement.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 md:hidden">
      <div class="absolute inset-0 bg-black/60" aria-hidden="true" data-testid="drawer-backdrop" @click="open = false" />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        class="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col gap-2 overflow-y-auto border-r border-line bg-panel p-4 pt-[max(16px,env(safe-area-inset-top))] shadow-[var(--shadow-2)]"
      >
        <div class="flex items-center justify-between">
          <BrandSpectralMark :size="30" title="F-Ray-grance" />
          <IconButton label="Close menu" icon="close" @click="open = false" />
        </div>
        <nav aria-label="Menu" class="mt-3 flex flex-col">
          <template v-for="(g, gi) in [...MAIN_GROUPS, { key: 'utility', label: 'Settings', items: UTILITY_NAV }]" :key="g.key">
            <div v-if="gi > 0" class="mx-3 my-2 h-px bg-line" aria-hidden="true" />
            <ul class="m-0 flex list-none flex-col gap-0.5 p-0" :aria-label="g.label">
              <li v-for="item in g.items" :key="item.to">
                <NuxtLink
                  :to="item.to"
                  class="tap flex items-center gap-3 rounded-control px-3 py-2 no-underline"
                  :class="isActive(item, route.path, route.query) ? 'bg-raised font-medium text-ink' : 'text-ink-2'"
                  :aria-current="isActive(item, route.path, route.query) ? 'page' : undefined"
                >
                  <AppIcon :name="item.icon" />
                  <span class="flex flex-col"><span>{{ item.label }}</span><span class="text-[12px] text-ink-3">{{ item.description }}</span></span>
                </NuxtLink>
              </li>
            </ul>
          </template>
        </nav>
        <div class="mt-auto flex items-center justify-between border-t border-line pt-3">
          <span class="text-sm text-ink-2">{{ owner?.displayName }}</span>
          <ShellThemeToggle />
        </div>
        <button type="button" class="btn btn-quiet w-full" @click="signOut">
          <AppIcon name="logout" :size="18" /> Sign out
        </button>
      </div>
    </div>
  </Teleport>
</template>
