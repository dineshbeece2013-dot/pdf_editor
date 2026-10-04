/**
 * Environment parsing and validation for the backend.
 *
 * `loadConfig` is pure with respect to its input so tests can build a config
 * from a plain object instead of mutating process.env.
 */

export interface RazorpayEnv {
  keyId: string;
  keySecret: string;
  currency: string;
}

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  env: NodeEnv;
  isProd: boolean;
  port: number;
  appOrigin: string;
  databaseUrl: string;
  /** Enables TLS to PostgreSQL — required by most managed providers. */
  databaseSsl: boolean;
  sessionSecret: string;
  razorpayEncryptionKey: string;
  sessionTtlMs: number;
  admin: { email: string; password: string; name: string };
  razorpay: RazorpayEnv;
  /**
   * Enables the "Complete demo payment" sandbox button, which grants Pro
   * without collecting money. Forced off in production regardless of the env
   * var, so a misconfigured deployment cannot hand out free subscriptions.
   */
  allowDemoPayments: boolean;
}

const HEX64 = /^[0-9a-f]{64}$/i;

class ConfigError extends Error {}

function readString(env: NodeJS.ProcessEnv, key: string, fallback = ''): string {
  const raw = env[key];
  return typeof raw === 'string' ? raw.trim() : fallback;
}

function readInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = readString(env, key);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new ConfigError(`${key} must be an integer, got "${raw}".`);
  return n;
}

function readBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = readString(env, key).toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** A dev/test-only stand-in so the app boots without ceremony outside production. */
function devSecret(label: string): string {
  // Deterministic (not random) so restarts do not silently invalidate sessions
  // and cookies during local development.
  let out = '';
  while (out.length < 64) out += label;
  return out.slice(0, 64);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawEnv = readString(env, 'NODE_ENV', 'development');
  const nodeEnv: NodeEnv =
    rawEnv === 'production' ? 'production' : rawEnv === 'test' ? 'test' : 'development';
  const isProd = nodeEnv === 'production';

  const databaseUrl = readString(env, 'DATABASE_URL');
  if (!databaseUrl) {
    throw new ConfigError('DATABASE_URL is required (e.g. postgres://user:pass@localhost:5432/pdfpro).');
  }

  let sessionSecret = readString(env, 'SESSION_SECRET');
  if (!sessionSecret) {
    if (isProd) throw new ConfigError('SESSION_SECRET is required in production.');
    sessionSecret = devSecret('session-secret-dev-only');
  } else if (isProd && !HEX64.test(sessionSecret)) {
    throw new ConfigError('SESSION_SECRET must be 64 hex characters in production.');
  } else if (sessionSecret.length < 32) {
    throw new ConfigError('SESSION_SECRET must be at least 32 characters.');
  }

  let razorpayEncryptionKey = readString(env, 'RAZORPAY_ENCRYPTION_KEY');
  if (!razorpayEncryptionKey) {
    if (isProd) throw new ConfigError('RAZORPAY_ENCRYPTION_KEY is required in production.');
    razorpayEncryptionKey = devSecret('razorpay-key-dev-only');
  } else if (isProd && !HEX64.test(razorpayEncryptionKey)) {
    throw new ConfigError('RAZORPAY_ENCRYPTION_KEY must be 64 hex characters in production.');
  } else if (razorpayEncryptionKey.length < 32) {
    throw new ConfigError('RAZORPAY_ENCRYPTION_KEY must be at least 32 characters.');
  }

  const allowDemoPayments = isProd ? false : readBool(env, 'ALLOW_DEMO_PAYMENTS', true);

  return {
    env: nodeEnv,
    isProd,
    port: readInt(env, 'PORT', 4000),
    appOrigin: readString(env, 'APP_ORIGIN', 'http://localhost:5173'),
    databaseUrl,
    databaseSsl: readBool(env, 'DATABASE_SSL', false),
    sessionSecret,
    razorpayEncryptionKey,
    sessionTtlMs: readInt(env, 'SESSION_TTL_DAYS', 7) * 24 * 60 * 60 * 1000,
    admin: {
      email: readString(env, 'ADMIN_EMAIL', 'admin@pdfpro.com').toLowerCase(),
      password: readString(env, 'ADMIN_PASSWORD'),
      name: readString(env, 'ADMIN_NAME', 'Admin'),
    },
    razorpay: {
      keyId: readString(env, 'RAZORPAY_KEY_ID'),
      keySecret: readString(env, 'RAZORPAY_KEY_SECRET'),
      currency: readString(env, 'RAZORPAY_CURRENCY', 'INR') || 'INR',
    },
    allowDemoPayments,
  };
}

export { ConfigError };
