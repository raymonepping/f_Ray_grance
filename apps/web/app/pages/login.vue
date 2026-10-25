<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: 'Sign in · F-Ray-grance' });
const { login, status } = useSession();
const route = useRoute();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const next = computed(() => {
  const n = typeof route.query.next === 'string' ? route.query.next : '/collection';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/collection'; // no open redirects
});
const expired = computed(() => status.value === 'expired');
async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await login(username.value.trim(), password.value);
    password.value = '';
    await navigateTo(next.value);
  } catch (e) {
    password.value = '';
    if (e instanceof ApiFailure && e.code === 'RATE_LIMITED') error.value = 'Too many sign-in attempts. Wait a few minutes and try again.';
    else if (e instanceof ApiFailure && e.code === 'NETWORK') error.value = 'The Mac running F-Ray-grance is unreachable.';
    else if (e instanceof ApiFailure && e.code === 'CSRF_REJECTED') error.value = 'This address is not allowed to sign in. Use the configured app address.';
    else error.value = 'Sign-in failed. Check your username and password.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col items-center gap-4 text-center">
      <BrandSpectralMark :size="52" title="F-Ray-grance" class="text-ink" />
      <div>
        <h1 class="text-[28px]">F-Ray-grance</h1>
        <p class="m-0 mt-2 text-[14px] text-ink-2">Don't just track your fragrances. Understand your rotation.</p>
      </div>
    </div>
    <GlassPanel variant="overlay" as="section" class="p-6 sm:p-7" aria-labelledby="signin-title">
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <div class="flex items-center justify-between">
          <h2 id="signin-title" class="text-[19px]">Sign in</h2>
          <span class="flex items-center gap-2 text-[12px] text-ink-3"><AppIcon name="lock" :size="14" /> Local session</span>
        </div>
        <StatusBanner v-if="expired" tone="warning" title="Your session expired">Sign in again to continue.</StatusBanner>
        <div class="flex flex-col gap-1.5">
          <label for="username" class="text-[13px] font-medium text-ink-2">Username</label>
          <input id="username" v-model="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required class="field" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="password" class="text-[13px] font-medium text-ink-2">Password</label>
          <input id="password" v-model="password" name="password" type="password" autocomplete="current-password" required class="field" />
        </div>
        <p v-if="error" role="alert" class="m-0 text-[13px] text-bad">{{ error }}</p>
        <button type="submit" :disabled="busy || !username || !password" class="btn btn-primary mt-1 w-full">
          {{ busy ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </GlassPanel>
    <p class="m-0 text-center text-[12px] text-ink-3">Private app. The owner account is created on the Mac (<code class="readout whitespace-nowrap">make owner-create</code>); there is no public sign-up.</p>
  </div>
</template>
