<script setup lang="ts">
// Settings & system health (DESIGN §6.6, §12.1). Shows only what the server reports;
// backup labels are "Last manual backup" / "Last manually verified restore" — never a
// green "protected" badge.
usePageHeader({ title: 'Settings' });
const { prefs, set } = usePreferences();
const { owner, logout } = useSession();
const conn = useConnection();
interface SystemStatus {
  scento: { lastCheckedAt: string | null; verifiedFragrances: number };
  backup: { lastManualBackupAt: string | null; lastVerifiedRestoreAt: string | null; reported: boolean };
}
const status = ref<SystemStatus | null>(null);
const statusError = ref<string | null>(null);
onMounted(async () => {
  void conn.probe();
  try {
    status.value = await apiFetch<SystemStatus>('/api/v1/system/status');
  } catch (e) {
    statusError.value = e instanceof ApiFailure ? e.message : 'Unavailable';
  }
});
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null);
async function signOut() {
  await logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-6">
    <h1>Settings</h1>

    <GlassPanel variant="solid" as="section" class="flex flex-col gap-4 p-5" aria-labelledby="appearance">
      <h2 id="appearance">Appearance</h2>
      <fieldset class="m-0 flex flex-wrap gap-3 border-0 p-0">
        <legend class="mb-2 text-sm font-semibold">Theme</legend>
        <label v-for="t in ['system', 'dark', 'light'] as const" :key="t" class="tap flex items-center gap-2 rounded-control border border-line px-4 capitalize">
          <input type="radio" name="theme" :value="t" :checked="prefs.theme === t" class="size-4 accent-[var(--accent-gold)]" @change="set('theme', t)" /> {{ t }}
        </label>
      </fieldset>
      <label class="tap flex items-center gap-3"><input type="checkbox" class="size-5 accent-[var(--accent-gold)]" :checked="prefs.reduceTransparency" @change="set('reduceTransparency', !prefs.reduceTransparency)" /> Reduce transparency (solid surfaces instead of glass)</label>
      <label class="tap flex items-center gap-3"><input type="checkbox" class="size-5 accent-[var(--accent-gold)]" :checked="prefs.reduceMotion" @change="set('reduceMotion', !prefs.reduceMotion)" /> Reduce motion</label>
      <label class="tap hidden items-center gap-3 xl:flex"><input type="checkbox" class="size-5 accent-[var(--accent-gold)]" :checked="prefs.sidebarCollapsed" @change="set('sidebarCollapsed', !prefs.sidebarCollapsed)" /> Collapse the sidebar to icons</label>
    </GlassPanel>

    <GlassPanel variant="solid" as="section" class="flex flex-col gap-3 p-5" aria-labelledby="session">
      <h2 id="session">Session</h2>
      <p class="m-0">Signed in as <strong>{{ owner?.displayName }}</strong> ({{ owner?.username }}).</p>
      <p class="m-0 text-sm text-ink-2">Being on your private network does not sign you in; this app checks its own owner session on every request.</p>
      <button type="button" class="tap flex w-fit items-center gap-2 rounded-control border border-line px-4" @click="signOut"><AppIcon name="logout" /> Sign out</button>
    </GlassPanel>

    <GlassPanel variant="solid" as="section" class="flex flex-col gap-3 p-5" aria-labelledby="connection">
      <h2 id="connection">Connection</h2>
      <p class="m-0" data-testid="settings-connection">{{ CONNECTION_LABEL[conn.state.value] }}</p>
      <p class="m-0 text-sm text-ink-2">F-Ray-grance runs on your Mac. When the Mac sleeps or is offline, remote access is unavailable; nothing is lost.</p>
    </GlassPanel>

    <GlassPanel id="sources" variant="solid" as="section" class="flex flex-col gap-3 p-5" aria-labelledby="sources-h">
      <h2 id="sources-h">Data sources</h2>
      <p class="m-0">Fragrance facts come from the <a href="https://www.scento.com/developers/perfume-api" rel="noopener noreferrer" target="_blank">Scento Perfume API<span class="sr-only"> (opens in a new tab)</span></a>, attributed on every field. Scento data is not an endorsement by any perfume house.</p>
      <p v-if="status" class="m-0 text-sm text-ink-2">
        {{ status.scento.verifiedFragrances }} verified fragrance{{ status.scento.verifiedFragrances === 1 ? '' : 's' }} in your library ·
        last Scento check: {{ when(status.scento.lastCheckedAt) ?? 'never' }}
      </p>
    </GlassPanel>

    <GlassPanel id="privacy" variant="solid" as="section" class="flex flex-col gap-3 p-5" aria-labelledby="privacy-h">
      <h2 id="privacy-h">Privacy &amp; provenance</h2>
      <ul class="m-0 flex flex-col gap-1 pl-5 text-ink-2">
        <li>Only the brand and fragrance name you search for are sent to Scento — never your ratings, notes or collection.</li>
        <li>Every fact is labelled Scento, Official, Derived or Personal. Your corrections are never overwritten by a refresh.</li>
        <li>Unknown values stay unknown: no invented notes, no fake scores.</li>
      </ul>
    </GlassPanel>

    <GlassPanel variant="solid" as="section" class="flex flex-col gap-3 p-5" aria-labelledby="backup-h">
      <h2 id="backup-h">Backups</h2>
      <dl class="m-0 grid gap-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt class="font-semibold">Last manual backup</dt>
        <dd class="m-0" data-testid="last-manual-backup">{{ status?.backup.reported ? (when(status.backup.lastManualBackupAt) ?? 'None recorded') : 'Not reported to the app' }}</dd>
        <dt class="font-semibold">Last manually verified restore</dt>
        <dd class="m-0" data-testid="last-verified-restore">{{ status?.backup.reported ? (when(status.backup.lastVerifiedRestoreAt) ?? 'None recorded') : 'Not reported to the app' }}</dd>
      </dl>
      <p class="m-0 text-sm text-ink-2">Backups are manual: run <code>make backup</code>, copy it off this Mac, then <code>make restore-test</code>. There is no automatic schedule, so anything saved after the last backup is not yet protected.</p>
      <p v-if="statusError" class="m-0 text-sm text-warn">System status unavailable: {{ statusError }}</p>
    </GlassPanel>
  </div>
</template>
