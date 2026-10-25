<script setup lang="ts">
// Session expired over an open page: keep the page (and any unsaved text) in place,
// re-authenticate in a dialog (DESIGN §6.6).
const { login, status } = useSession();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const first = ref<HTMLInputElement | null>(null);
onMounted(() => first.value?.focus());
async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await login(username.value, password.value);
    password.value = '';
  } catch (e) {
    error.value = e instanceof ApiFailure && e.code === 'RATE_LIMITED' ? 'Too many attempts. Wait a few minutes.' : 'Sign-in failed. Check username and password.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="status === 'expired'" class="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4">
      <form role="alertdialog" aria-modal="true" aria-labelledby="expired-title" class="bay w-full max-w-sm rounded-card p-6" @submit.prevent="submit">
        <h2 id="expired-title" class="flex items-center gap-2"><AppIcon name="lock" /> Session expired</h2>
        <p class="text-[14px] text-ink-2">Sign in again to continue. This page and anything you typed stay as they are.</p>
        <label class="mt-3 block text-[13px] font-medium text-ink-2" for="re-user">Username</label>
        <input id="re-user" ref="first" v-model="username" autocomplete="username" class="field w-full mt-1" />
        <label class="mt-3 block text-[13px] font-medium text-ink-2" for="re-pass">Password</label>
        <input id="re-pass" v-model="password" type="password" autocomplete="current-password" class="field w-full mt-1" />
        <p v-if="error" role="alert" class="m-0 mt-3 text-[14px] text-bad">{{ error }}</p>
        <button type="submit" :disabled="busy" class="btn btn-primary mt-4 w-full">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
      </form>
    </div>
  </Teleport>
</template>
