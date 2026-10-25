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
  <div class="flex flex-col gap-6">
    <div class="text-center">
      <span class="mx-auto mb-3 grid size-12 place-items-center rounded-control bg-gold text-xl font-bold text-gold-ink" aria-hidden="true">F</span>
      <h1>F-Ray-grance</h1>
      <p class="m-0 mt-1 text-ink-2">Don't just track your fragrances. Understand your rotation.</p>
    </div>
    <GlassPanel variant="glass" as="section" class="p-6" aria-labelledby="signin-title">
      <form class="flex flex-col gap-3" novalidate @submit.prevent="submit">
        <h2 id="signin-title" class="text-xl">Sign in</h2>
        <StatusBanner v-if="expired" tone="warning" title="Your session expired">Sign in again to continue.</StatusBanner>
        <label for="username" class="text-sm font-semibold">Username</label>
        <input id="username" v-model="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required class="tap rounded-control border border-line bg-solid px-3 text-ink" />
        <label for="password" class="text-sm font-semibold">Password</label>
        <input id="password" v-model="password" name="password" type="password" autocomplete="current-password" required class="tap rounded-control border border-line bg-solid px-3 text-ink" />
        <p v-if="error" role="alert" class="m-0 text-sm text-bad">{{ error }}</p>
        <button type="submit" :disabled="busy || !username || !password" class="tap mt-2 rounded-control bg-gold font-semibold text-gold-ink motion hover:brightness-110 disabled:opacity-60">
          {{ busy ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </GlassPanel>
    <p class="m-0 text-center text-xs text-ink-3">Private app. The owner account is created on the Mac (<code>make owner-create</code>); there is no public sign-up.</p>
  </div>
</template>
