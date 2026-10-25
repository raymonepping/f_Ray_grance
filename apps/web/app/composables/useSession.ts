// Owner session state. The server is the authority: this only mirrors /api/v1/session.
export interface Owner {
  id: string;
  username: string;
  displayName: string;
}

type SessionStatus = 'unknown' | 'authenticated' | 'anonymous' | 'expired';

export function useSession() {
  const owner = useState<Owner | null>('session:owner', () => null);
  const status = useState<SessionStatus>('session:status', () => 'unknown');

  async function refresh(): Promise<boolean> {
    try {
      const r = await apiFetch<{ owner: Owner }>('/api/v1/session');
      owner.value = r.owner;
      status.value = 'authenticated';
      return true;
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'UNAUTHENTICATED') {
        owner.value = null;
        if (status.value !== 'expired') status.value = 'anonymous';
        return false;
      }
      throw err;
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const r = await apiFetch<{ owner: Owner }>('/api/v1/auth/login', { method: 'POST', body: { username, password } });
    owner.value = r.owner;
    status.value = 'authenticated';
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      owner.value = null;
      status.value = 'anonymous';
    }
  }

  /** Called by apiFetch on any 401 from a protected route. */
  function expire(): void {
    if (status.value === 'authenticated') status.value = 'expired';
    owner.value = null;
  }

  return { owner, status, refresh, login, logout, expire };
}
