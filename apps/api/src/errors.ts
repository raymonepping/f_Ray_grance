// Versioned error envelope: { error: { code, message, requestId, details? } }.
// Messages are safe for the client; internals stay in logs (without personal content).
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CSRF_REJECTED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Shown when the database login is being renewed (typically right after the Mac wakes from sleep). */
export const DB_RECONNECTING = 'The database connection is being renewed, usually right after the Mac wakes from sleep. Try again in a minute.';

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; requestId: string; details?: unknown };
}

export function envelope(code: ErrorCode, message: string, requestId: string, details?: unknown): ErrorEnvelope {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}

export function statusFor(code: ErrorCode): number {
  return STATUS[code];
}
