<script setup lang="ts">
// Accessible drawer (DESIGN §4.3): focus trap, Escape, backdrop close, scroll lock,
// focus restored to the trigger.
import { NAVIGATION, isActive } from '~~/shared/navigation';

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
      <div class="absolute inset-0 bg-black/50" aria-hidden="true" data-testid="drawer-backdrop" @click="open = false" />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        class="glass-strong absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col gap-2 overflow-y-auto rounded-none border-y-0 border-l-0 p-4 pt-[max(16px,env(safe-area-inset-top))]"
      >
        <div class="flex items-center justify-between">
          <span class="font-semibold tracking-[0.12em]">F-RAY-GRANCE</span>
          <IconButton label="Close menu" icon="close" @click="open = false" />
        </div>
        <nav aria-label="Menu" class="flex flex-col gap-1">
          <NuxtLink
            v-for="item in NAVIGATION"
            :key="item.to"
            :to="item.to"
            class="tap flex items-center gap-3 rounded-control px-3 no-underline"
            :class="isActive(item, route.path, route.query) ? 'bg-sunken font-semibold text-ink' : 'text-ink-2'"
            :aria-current="isActive(item, route.path, route.query) ? 'page' : undefined"
          >
            <AppIcon :name="item.icon" />
            <span class="flex flex-col"><span>{{ item.label }}</span><span class="text-xs text-ink-3">{{ item.description }}</span></span>
          </NuxtLink>
        </nav>
        <div class="mt-auto flex items-center justify-between border-t border-line pt-3">
          <span class="text-sm text-ink-2">{{ owner?.displayName }}</span>
          <ShellThemeToggle />
        </div>
        <button type="button" class="tap flex items-center gap-2 rounded-control border border-line px-3 text-ink-2" @click="signOut">
          <AppIcon name="logout" /> Sign out
        </button>
      </div>
    </div>
  </Teleport>
</template>
