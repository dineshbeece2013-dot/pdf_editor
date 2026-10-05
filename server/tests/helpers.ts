import { newDb, DataType } from 'pg-mem';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { Database } from '../src/db/index.js';
import { runMigrations } from '../src/migrate.js';

/** Build a config from a plain object — no process.env mutation. */
export function makeConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test/test',
    SESSION_SECRET: 'a'.repeat(64),
    RAZORPAY_ENCRYPTION_KEY: 'b'.repeat(64),
    APP_ORIGIN: 'http://localhost:5173',
    ALLOW_DEMO_PAYMENTS: 'true',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  setCookies: string[];
}

/** A single browser-like client that keeps the session cookie between calls. */
export class TestClient {
  private cookie = '';

  constructor(
    private readonly base: string,
    private readonly origin: string,
  ) {}

  get cookieHeader(): string {
    return this.cookie;
  }

  async request<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.send<T>(method, path, body === undefined ? undefined : JSON.stringify(body));
  }

  /** POST a body byte-for-byte, so tests can send malformed JSON. */
  postRaw<T = any>(path: string, body: string): Promise<ApiResponse<T>> {
    return this.send<T>('POST', path, body);
  }

  private async send<T = any>(method: string, path: string, raw?: string): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { origin: this.origin };
    if (raw !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;

    const res = await fetch(this.base + path, {
      method,
      headers,
      body: raw,
    });

    const setCookies = res.headers.getSetCookie();
    for (const raw of setCookies) {
      const pair = raw.split(';')[0];
      if (pair && pair.startsWith('pdfpro.sid=')) this.cookie = pair;
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed as T, setCookies };
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = any>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  patch<T = any>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  put<T = any>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }
  del<T = any>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

export interface Harness {
  db: Database;
  config: AppConfig;
  base: string;
  client(): TestClient;
  close(): Promise<void>;
}

/**
 * Boot the real Express app against an in-memory PostgreSQL. Everything below
 * the socket — routing, session cookies, argon2, SQL — is the production code.
 */
export async function createHarness(overrides: Record<string, string> = {}): Promise<Harness> {
  const config = makeConfig(overrides);

  const memory = newDb({ autoCreateForeignKeyIndices: true });

  // pg-mem implements only a subset of PostgreSQL's built-ins. connect-pg-simple
  // calls to_timestamp() when writing sessions, so teach the emulator that one.
  memory.public.registerFunction({
    name: 'to_timestamp',
    args: [DataType.text],
    returns: DataType.timestamptz,
    implementation: (seconds: string) => new Date(Number(seconds) * 1000),
  });

  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  const db = new Database(pool as never);

  await runMigrations(db);

  const app = createApp({ config, db, pool: pool as never });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  return {
    db,
    config,
    base,
    client: () => new TestClient(base, config.appOrigins[0]),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
    },
  };
}

/**
 * Create an admin directly, the way seed-admin.ts does — never via the API.
 * Mirrors seed-admin.ts's idempotency: if the account already exists it is
 * returned rather than inserted again.
 */
export async function seedAdmin(
  harness: Harness,
  email = 'admin@pdfpro.com',
  password = 'admin-password-123',
): Promise<string> {
  const { createUser, findByEmail } = await import('../src/repositories/users.js');
  const { hashPassword } = await import('../src/security/password.js');

  const existing = await findByEmail(harness.db, email);
  if (existing) return existing.id;

  const row = await createUser(harness.db, {
    id: crypto.randomUUID(),
    name: 'Admin',
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
  });
  return row.id;
}