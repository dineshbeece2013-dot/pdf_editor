import type { Queryable } from '../db/index.js';
import { expiryFromNow, getPlan, PLAN_IDS } from '../plans.js';

/** A row as PostgreSQL returns it. `password_hash` never leaves this module. */
export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  plan: 'free' | 'pro';
  subscription_plan: string | null;
  subscription_expires_at: Date | string | null;
  free_edits_used_today: number;
  last_free_edit_date: Date | string | null;
  total_edits: number;
  created_at: Date | string;
}

/** The shape sent to the browser. Note the complete absence of `password_hash`. */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  plan: 'free' | 'pro';
  subscriptionPlan: string | null;
  subscriptionExpiresAt: number | null;
  freeEditsUsedToday: number;
  lastFreeEditDate: string | null;
  totalEdits: number;
  createdAt: number;
}

function toMillis(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    plan: row.plan,
    subscriptionPlan: row.subscription_plan,
    subscriptionExpiresAt: toMillis(row.subscription_expires_at),
    freeEditsUsedToday: Number(row.free_edits_used_today ?? 0),
    lastFreeEditDate: toDateOnly(row.last_free_edit_date),
    totalEdits: Number(row.total_edits ?? 0),
    createdAt: toMillis(row.created_at) ?? 0,
  };
}

const RETURNING = `
  RETURNING id, name, email, password_hash, role, plan, subscription_plan,
            subscription_expires_at, free_edits_used_today, last_free_edit_date,
            total_edits, created_at
`;

const SELECT = `
  SELECT id, name, email, password_hash, role, plan, subscription_plan,
         subscription_expires_at, free_edits_used_today, last_free_edit_date,
         total_edits, created_at
  FROM users
`;

export async function findByEmail(db: Queryable, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`${SELECT} WHERE lower(email) = lower($1) LIMIT 1`, [email]);
  return rows[0] ?? null;
}

export async function findById(db: Queryable, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`${SELECT} WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function listUsers(db: Queryable): Promise<UserRow[]> {
  const { rows } = await db.query<UserRow>(`${SELECT} ORDER BY created_at DESC`);
  return rows;
}

export async function countAdmins(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM users WHERE role = 'admin'`,
  );
  return Number(rows[0]?.count ?? 0);
}

export interface CreateUserInput {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  /**
   * Only ever set by server-internal callers — registration hardcodes 'user'
   * and the bootstrap script sets 'admin'. It is never read from a request body.
   */
  role: 'admin' | 'user';
}

export async function createUser(db: Queryable, input: CreateUserInput): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (id, name, email, password_hash, role)
     VALUES ($1, $2, lower($3), $4, $5)${RETURNING}`,
    [input.id, input.name, input.email, input.passwordHash, input.role],
  );
  const row = rows[0];
  if (!row) throw new Error('Failed to create user.');
  return row;
}

export async function updatePasswordHash(db: Queryable, id: string, passwordHash: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
    [id, passwordHash],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteUser(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/**
 * The only columns an admin request may change. `email`, `password_hash` and
 * `id` are deliberately absent: changing an email needs re-verification, and
 * passwords go through the dedicated change-password flow.
 */
const ADMIN_EDITABLE: Record<string, string> = {
  name: 'name',
  role: 'role',
  plan: 'plan',
  subscriptionPlan: 'subscription_plan',
  subscriptionExpiresAt: 'subscription_expires_at',
  freeEditsUsedToday: 'free_edits_used_today',
  lastFreeEditDate: 'last_free_edit_date',
  totalEdits: 'total_edits',
};

export type AdminUserPatch = Record<string, unknown>;

export interface PatchResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate an admin-supplied patch. Unknown keys and out-of-range values are
 * rejected outright rather than silently dropped, so a typo in the admin UI
 * cannot quietly widen someone's access.
 */
export function validateAdminPatch(patch: AdminUserPatch): PatchResult {
  const entries = Object.entries(patch ?? {});
  if (entries.length === 0) return { ok: false, error: 'No fields to update.' };

  for (const [key, value] of entries) {
    if (!Object.prototype.hasOwnProperty.call(ADMIN_EDITABLE, key)) {
      return { ok: false, error: `Field "${key}" cannot be changed here.` };
    }
    if (key === 'name' && (typeof value !== 'string' || value.trim().length < 1 || value.length > 200)) {
      return { ok: false, error: 'Name must be between 1 and 200 characters.' };
    }
    if (key === 'role' && value !== 'admin' && value !== 'user') {
      return { ok: false, error: 'Role must be "admin" or "user".' };
    }
    if (key === 'plan' && value !== 'free' && value !== 'pro') {
      return { ok: false, error: 'Plan must be "free" or "pro".' };
    }
    if (key === 'subscriptionPlan' && value !== null && !PLAN_IDS.includes(value as never)) {
      return { ok: false, error: 'Subscription plan must be null or a known plan id.' };
    }
    if (key === 'subscriptionExpiresAt' && value !== null && !Number.isFinite(Number(value))) {
      return { ok: false, error: 'Subscription expiry must be null or a timestamp in milliseconds.' };
    }
    if ((key === 'freeEditsUsedToday' || key === 'totalEdits') && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
      return { ok: false, error: `${key} must be a non-negative integer.` };
    }
    if (key === 'lastFreeEditDate' && value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return { ok: false, error: 'lastFreeEditDate must be null or YYYY-MM-DD.' };
    }
  }
  return { ok: true };
}

export async function updateUser(db: Queryable, id: string, patch: AdminUserPatch): Promise<UserRow | null> {
  const validation = validateAdminPatch(patch);
  if (!validation.ok) throw new Error(validation.error);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    values.push(value);
    sets.push(`${ADMIN_EDITABLE[key]} = $${values.length}`);
  }
  values.push(id);

  const { rows } = await db.query<UserRow>(
    `UPDATE users SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${values.length}${RETURNING}`,
    values,
  );
  return rows[0] ?? null;
}


/** Today in the server's local timezone, matching the client-side rule. */
export function todayString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface EditAccess {
  canEdit: boolean;
  reason?: string;
  /** -1 means "unlimited" (admin / active subscriber). */
  remainingFreeEdits: number;
  isPro: boolean;
  planName: string;
  daysRemaining: number | null;
}

/** Server-side equivalent of the client's `canUserEdit`; the authority lives here. */
export function evaluateEditAccess(user: UserRow): EditAccess {
  const expiry = toMillis(user.subscription_expires_at);
  const active = !!user.subscription_plan && expiry !== null && expiry > Date.now();

  if (user.role === 'admin') {
    return { canEdit: true, remainingFreeEdits: -1, isPro: true, planName: 'Admin (Unlimited)', daysRemaining: null };
  }
  if (active) {
    return {
      canEdit: true,
      remainingFreeEdits: -1,
      isPro: true,
      planName: user.subscription_plan!,
      daysRemaining: Math.max(0, Math.ceil((expiry! - Date.now()) / 86_400_000)),
    };
  }

  const used = toDateOnly(user.last_free_edit_date) === todayString() ? Number(user.free_edits_used_today ?? 0) : 0;
  const remaining = Math.max(0, 1 - used);
  return {
    canEdit: remaining > 0,
    reason: remaining > 0 ? undefined : "You've used your 1 free edit for today. Subscribe for unlimited editing.",
    remainingFreeEdits: remaining,
    isPro: false,
    planName: 'Free',
    daysRemaining: null,
  };
}

/**
 * Count an edit against the user. Admins and active subscribers are unlimited;
 * everyone else gets one counted edit per calendar day, resetting when the
 * date rolls over.
 */
export async function recordEditForUser(db: Queryable, user: UserRow): Promise<UserRow> {
  const access = evaluateEditAccess(user);

  if (access.remainingFreeEdits === -1) {
    const { rows } = await db.query<UserRow>(
      `UPDATE users SET total_edits = total_edits + 1, updated_at = now() WHERE id = $1${RETURNING}`,
      [user.id],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to record edit.');
    return row;
  }

  const today = todayString();
  const sameDay = toDateOnly(user.last_free_edit_date) === today;
  const used = sameDay ? Number(user.free_edits_used_today ?? 0) : 0;

  const { rows } = await db.query<UserRow>(
    `UPDATE users
        SET free_edits_used_today = $2, last_free_edit_date = $3,
            total_edits = total_edits + 1, updated_at = now()
      WHERE id = $1${RETURNING}`,
    [user.id, used + 1, today],
  );
  const row = rows[0];
  if (!row) throw new Error('Failed to record edit.');
  return row;
}

/**
 * Turn on Pro for a user. The expiry is computed from the server-side plan
 * catalogue, never from anything the client sent.
 */
export async function activateSubscription(db: Queryable, userId: string, planId: unknown): Promise<UserRow | null> {
  const plan = getPlan(planId);
  if (!plan) throw new Error('Unknown plan id.');

  const { rows } = await db.query<UserRow>(
    `UPDATE users
        SET plan = 'pro', subscription_plan = $2, subscription_expires_at = $3,
            free_edits_used_today = 0, updated_at = now()
      WHERE id = $1${RETURNING}`,
    [userId, plan.id, new Date(expiryFromNow(plan.durationDays))],
  );
  return rows[0] ?? null;
}

/** Return a user to the free tier. */
export async function cancelSubscription(db: Queryable, userId: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
        SET plan = 'free', subscription_plan = NULL, subscription_expires_at = NULL, updated_at = now()
      WHERE id = $1${RETURNING}`,
    [userId],
  );
  return rows[0] ?? null;
}

