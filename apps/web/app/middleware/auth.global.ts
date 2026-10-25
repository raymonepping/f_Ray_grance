// Every page except /login requires the owner session (server-verified). The browser
// route guard is a convenience; the API enforces authorization independently.
export default defineNuxtRouteMiddleware(async (to) => {
  const { status, refresh } = useSession();
  if (to.path === '/login') return;
  if (status.value === 'unknown' || status.value === 'anonymous') {
    try {
      if (await refresh()) return;
    } catch {
      return; // unreachable/degraded: the shell shows the truthful state, not a login loop
    }
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} });
  }
});
