// Local, browser-only auth store.
// NOTE: demo implementation — data lives in localStorage and passwords are
// stored as-is. Replace these functions with real API calls in production.

export interface AppUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  plan: 'free' | 'pro';
  createdAt: number;
}

const USERS_KEY = 'pdfpro.users';
const SESSION_KEY = 'pdfpro.session';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable/full — ignore in demo */
  }
};

const uid = (prefix: string): string =>
  prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

/** Seed demo accounts on first run. Idempotent. */
export function seedUsers(): void {
  if (localStorage.getItem(USERS_KEY)) return;
  const now = Date.now();
  const seed: AppUser[] = [
    { id: 'user-admin', name: 'Admin', email: 'admin@pdfpro.com', password: 'admin123', role: 'admin', plan: 'pro', createdAt: now },
    { id: 'user-demo', name: 'Demo User', email: 'user@pdfpro.com', password: 'user123', role: 'user', plan: 'free', createdAt: now },
  ];
  write(USERS_KEY, seed);
}

export function listUsers(): AppUser[] {
  return read<AppUser[]>(USERS_KEY, []);
}

export function findUserByEmail(email: string): AppUser | null {
  const e = email.trim().toLowerCase();
  return listUsers().find((u) => u.email === e) ?? null;
}

export function createUser(input: {
  name: string;
  email: string;
  password: string;
  role?: AppUser['role'];
  plan?: AppUser['plan'];
}): AppUser {
  const user: AppUser = {
    id: uid('user'),
    name: input.name,
    email: input.email.trim().toLowerCase(),
    password: input.password,
    role: input.role ?? 'user',
    plan: input.plan ?? 'free',
    createdAt: Date.now(),
  };
  const users = listUsers();
  users.push(user);
  write(USERS_KEY, users);
  return user;
}

export function getSessionUserId(): string | null {
  return read<string | null>(SESSION_KEY, null);
}

export function setSessionUserId(id: string): void {
  write(SESSION_KEY, id);
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}