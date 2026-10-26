// Validated, non-secret configuration. Secrets are never read from environment
// variables: database credentials come from a file rendered by Vault Agent.
export interface Config {
  http: { host: string; port: number };
  db: { host: string; port: number; database: string; credentialsFile: string; poolMax: number };
  migrationsDir: string;
  trustedProxies: string[];
  publicOrigins: string[];
  session: { ttlHours: number; idleMinutes: number; keyFile: string };
  lockout: { maxFailures: number; windowMinutes: number };
  loginRatePerMinute: number;
  logLevel: string;
  tutorModel: string | null;
  importEnabled: boolean;
  images: { dir: string; providerHosts: string[]; externalHosts: string[] };
  /** File Vault Agent renders with the TinyFish key ({"api_key": ...}); empty or missing = off. */
  tinyfishKeyFile: string | null;
}

export class ConfigError extends Error {}

function str(env: NodeJS.ProcessEnv, key: string, fallback?: string): string {
  const v = env[key] ?? fallback;
  if (v === undefined || v === '') throw new ConfigError(`missing required setting ${key}`);
  return v;
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  const v = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new ConfigError(`${key} must be an integer in [${min}, ${max}]`);
  return v;
}

function list(env: NodeJS.ProcessEnv, key: string, fallback: string): string[] {
  return (env[key] ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function hosts(env: NodeJS.ProcessEnv, key: string): string[] {
  const out = list(env, key, '').map((h) => h.toLowerCase());
  for (const h of out) {
    if (!/^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/.test(h)) throw new ConfigError(`invalid host in ${key}: ${h}`);
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  for (const key of Object.keys(env)) {
    if (/^FRAY_.*(PASSWORD|SECRET|TOKEN)/.test(key)) {
      throw new ConfigError(`${key}: secrets must not be passed via environment; use the Vault Agent file`);
    }
  }
  const origins = list(env, 'FRAY_PUBLIC_ORIGINS', 'http://localhost:8470');
  for (const o of origins) {
    if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) throw new ConfigError(`invalid origin in FRAY_PUBLIC_ORIGINS: ${o}`);
  }
  return {
    http: { host: str(env, 'FRAY_HTTP_HOST', '0.0.0.0'), port: int(env, 'FRAY_HTTP_PORT', 8080, 1, 65535) },
    db: {
      host: str(env, 'FRAY_DB_HOST', 'fray-postgres'),
      port: int(env, 'FRAY_DB_PORT', 5432, 1, 65535),
      database: str(env, 'FRAY_DB_NAME', 'fray'),
      credentialsFile: str(env, 'FRAY_DB_CREDENTIALS_FILE', '/vault/rendered/db-runtime.json'),
      poolMax: int(env, 'FRAY_DB_POOL_MAX', 8, 1, 50),
    },
    migrationsDir: str(env, 'FRAY_MIGRATIONS_DIR', new URL('../../../db/migrations', import.meta.url).pathname),
    trustedProxies: list(env, 'FRAY_TRUSTED_PROXIES', ''),
    publicOrigins: origins,
    session: {
      ttlHours: int(env, 'FRAY_SESSION_TTL_HOURS', 12, 1, 24 * 30),
      idleMinutes: int(env, 'FRAY_SESSION_IDLE_MINUTES', 120, 5, 24 * 60),
      keyFile: str(env, 'FRAY_SESSION_KEY_FILE', '/vault/rendered/session.json'),
    },
    lockout: {
      maxFailures: int(env, 'FRAY_LOGIN_MAX_FAILURES', 5, 1, 100),
      windowMinutes: int(env, 'FRAY_LOGIN_LOCKOUT_MINUTES', 15, 1, 24 * 60),
    },
    loginRatePerMinute: int(env, 'FRAY_LOGIN_RATE_PER_MINUTE', 10, 1, 1000),
    logLevel: str(env, 'FRAY_LOG_LEVEL', 'info'),
    // Optional local generative model for the Academy tutor; unset = curated lessons only.
    tutorModel: env.FRAY_TUTOR_MODEL && /^[a-z0-9._:/-]{1,80}$/i.test(env.FRAY_TUTOR_MODEL) ? env.FRAY_TUTOR_MODEL : null,
    importEnabled: env.FRAY_IMPORT_ENABLED === 'true',
    // Perfume images: binaries on the persistent asset volume; remote hosts only when approved.
    images: {
      dir: str(env, 'FRAY_IMAGE_DIR', '/var/lib/fray/images'),
      providerHosts: hosts(env, 'FRAY_IMAGE_PROVIDER_HOSTS'),
      externalHosts: hosts(env, 'FRAY_IMAGE_EXTERNAL_HOSTS'),
    },
    tinyfishKeyFile: env.FRAY_TINYFISH_KEY_FILE === '' ? null : (env.FRAY_TINYFISH_KEY_FILE ?? '/vault/rendered/tinyfish.json'),
  };
}
