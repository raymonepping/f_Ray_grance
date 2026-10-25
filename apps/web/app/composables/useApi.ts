// Same-origin API client. Sends the double-submit CSRF token on mutations, parses the
// versioned error envelope, and turns transport failures into typed states the shell can
// show truthfully (session expired vs Mac unreachable vs dependency unavailable).
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CSRF_REJECTED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL'
  | 'NETWORK';

export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (UNSAFE.has(method)) {
    const csrf = readCookie('__Host-fray_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    useConnection().markUnreachable();
    throw new ApiFailure('NETWORK', 'The Mac running F-Ray-grance is unreachable', 0);
  }
  useConnection().markReachable();
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const env = (data as { error?: { code?: ApiErrorCode; message?: string; details?: unknown; requestId?: string } } | null)?.error;
    const code = env?.code ?? (res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL');
    if (code === 'UNAUTHENTICATED' && !path.endsWith('/auth/login')) useSession().expire();
    if (code === 'DEPENDENCY_UNAVAILABLE') useConnection().markDegraded((env?.details as { source?: string } | undefined)?.source ?? 'database');
    throw new ApiFailure(code, env?.message ?? `Request failed (${res.status})`, res.status, env?.details, env?.requestId);
  }
  return data as T;
}
