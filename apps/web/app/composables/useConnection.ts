// Truthful connection states (spec/DESIGN.md §6.6). Never a generic "offline": the shell
// distinguishes private HTTPS, local loopback, Mac unreachable, session expired and a
// degraded dependency (e.g. Scento) — and claims nothing it has not observed.
export type ConnectionState = 'checking' | 'private_https' | 'local' | 'unreachable' | 'degraded';

export function useConnection() {
  const state = useState<ConnectionState>('conn:state', () => 'checking');
  const degradedSource = useState<string | null>('conn:degraded', () => null);

  const reachable = (): ConnectionState => (typeof location !== 'undefined' && location.protocol === 'https:' ? 'private_https' : 'local');

  return {
    state,
    degradedSource,
    markReachable() {
      if (state.value !== 'degraded') state.value = reachable();
    },
    markUnreachable() {
      state.value = 'unreachable';
    },
    markDegraded(source: string) {
      state.value = 'degraded';
      degradedSource.value = source;
    },
    clearDegraded() {
      degradedSource.value = null;
      state.value = reachable();
    },
    async probe(): Promise<void> {
      try {
        const r = await fetch('/api/health/ready', { credentials: 'same-origin' });
        if (r.ok) {
          degradedSource.value = null;
          state.value = reachable();
        } else {
          state.value = 'degraded';
          degradedSource.value = 'database';
        }
      } catch {
        state.value = 'unreachable';
      }
    },
  };
}

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  checking: 'Checking connection…',
  private_https: 'Online through private HTTPS',
  local: 'Local connection on this Mac',
  unreachable: 'Mac unreachable',
  degraded: 'Partly unavailable',
};
