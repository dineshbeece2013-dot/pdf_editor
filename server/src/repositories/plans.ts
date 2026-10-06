import type { Queryable } from '../db/index.js';
import type { Plan } from '../plans.js';
import { ALLOWED_CURRENCIES, ALLOWED_PERIODS, DEFAULT_PLANS, PLAN_ID_RE } from '../plans.js';

/**
 * Editable plan catalogue. Seeded once from DEFAULT_PLANS; later edits live
 * in the database and are never overwritten. Every read that prices or grants
 * access goes through here, so a price changed in the admin dashboard is the
 * price charged.
 */

interface PlanRow {
  id: string;
  name: string;
  price: number | string;
  currency: string;
  duration_days: number;
  description: string;
  active: boolean;
  sort_order: number;
}

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    currency: row.currency,
    durationDays: Number(row.duration_days),
    description: row.description ?? '',
  };
}

const SELECT = `
  SELECT id, name, price::double precision AS price, currency, duration_days,
         description, active, sort_order
  FROM subscription_plans
`;

/** Insert any default that is missing. Never overwrites an admin's edits. */
export async function ensureDefaultPlans(db: Queryable): Promise<void> {
  for (const [index, plan] of DEFAULT_PLANS.entries()) {
    await db.query(
      `INSERT INTO subscription_plans
         (id, name, price, currency, duration_days, description, active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT (id) DO NOTHING`,
      [plan.id, plan.name, plan.price, plan.currency, plan.durationDays, plan.description, index],
    );
  }
}

/** Currently sellable plans for the checkout picker, shortest period first. */
export async function listPlans(db: Queryable): Promise<Plan[]> {
  const { rows } = await db.query<PlanRow>(
    `${SELECT} WHERE active = true ORDER BY sort_order ASC, duration_days ASC, id ASC`,
  );
  return rows.map(toPlan);
}

/** All plans including hidden ones, for the admin editor. */
export async function listAllPlans(db: Queryable): Promise<Plan[]> {
  const { rows } = await db.query<PlanRow>(
    `${SELECT} ORDER BY sort_order ASC, duration_days ASC, id ASC`,
  );
  return rows.map(toPlan);
}


/**
 * A sellable plan by id, or null for anything unknown, hidden or malformed.
 * Falls back to the seed defaults when the table is empty (e.g. a test that
 * created the schema without seeding), so pricing never 404s on a fresh db.
 */
export async function getPlan(db: Queryable, id: unknown): Promise<Plan | null> {
  if (typeof id !== 'string' || !PLAN_ID_RE.test(id)) return null;
  const { rows } = await db.query<PlanRow>(`${SELECT} WHERE id = $1 AND active = true LIMIT 1`, [id]);
  if (rows[0]) return toPlan(rows[0]);
  const fallback = DEFAULT_PLANS.find((plan) => plan.id === id);
  if (!fallback) return null;
  const existing = await db.query<{ id: string }>('SELECT id FROM subscription_plans WHERE id = $1', [id]);
  return existing.rows[0] ? null : { ...fallback };
}

export interface PlanPatch {
  name?: string;
  price?: number;
  currency?: string;
  durationDays?: number;
  description?: string;
  active?: boolean;
}


export function validatePlanPatch(body: Record<string, unknown>): { ok: true; patch: PlanPatch } | { ok: false; error: string } {
  const patch: PlanPatch = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 40) return { ok: false, error: 'Name must be 2-40 characters.' };
    patch.name = name;
  }
  if (body.price !== undefined) {
    const price = typeof body.price === 'number' ? body.price : Number(body.price);
    if (!Number.isFinite(price) || price <= 0 || price > 1000000) {
      return { ok: false, error: 'Price must be a number greater than 0.' };
    }
    patch.price = Math.round(price * 100) / 100;
  }
  if (body.currency !== undefined) {
    const currency = String(body.currency).trim().toUpperCase();
    if (!(ALLOWED_CURRENCIES as readonly string[]).includes(currency)) {
      return { ok: false, error: 'Currency must be INR or USD.' };
    }
    patch.currency = currency;
  }
  if (body.durationDays !== undefined) {
    const days = typeof body.durationDays === 'number' ? body.durationDays : Number(body.durationDays);
    if (!Number.isInteger(days) || !(ALLOWED_PERIODS as readonly number[]).includes(days)) {
      return { ok: false, error: 'Period must be 1, 7, 30, 90 or 365 days.' };
    }
    patch.durationDays = days;
  }
  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (description.length > 160) return { ok: false, error: 'Description must be at most 160 characters.' };
    patch.description = description;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return { ok: false, error: 'Active must be true or false.' };
    patch.active = body.active;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' };
  return { ok: true, patch };
}

export async function updatePlan(db: Queryable, id: string, patch: PlanPatch): Promise<Plan | null> {
  if (!PLAN_ID_RE.test(id)) return null;
  const sets: string[] = [];
  const values: unknown[] = [id];
  const set = (column: string, value: unknown): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.price !== undefined) set('price', patch.price);
  if (patch.currency !== undefined) set('currency', patch.currency);
  if (patch.durationDays !== undefined) set('duration_days', patch.durationDays);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.active !== undefined) set('active', patch.active);
  if (sets.length === 0) return null;
  sets.push('updated_at = now()');
  const { rows } = await db.query<PlanRow>(
    `UPDATE subscription_plans SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, name, price::double precision AS price, currency, duration_days,
               description, active, sort_order`,
    values,
  );
  return rows[0] ? toPlan(rows[0]) : null;
}
