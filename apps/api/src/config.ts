// Validated, non-secret configuration. Secrets are never read from environment
// variables: database credentials come from a file rendered by Vault Agent.
export interface Config {
  http: { host: string; port: number };
  db: { host: string; port: number; database: string; credentialsFile: string; poolMax: number };
  migrationsDir: string;
  trustedProxies: string[];
  publicOrigins: string[];
  session: { ttlHours: number; idleMinutes: number };
  logLevel: string;
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
    },
    logLevel: str(env, 'FRAY_LOG_LEVEL', 'info'),
  };
}
