/**
 * The server-authoritative plan catalogue.
 *
 * Prices, currency and durations live here and nowhere else. The browser never
 * sends an amount — it asks for an order, and the server prices it. That is
 * what stops a client from "paying" one rupee for a month of Pro.
 */

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  description: string;
}

export const PLANS = {
  'pro-weekly': {
    id: 'pro-weekly',
    name: '$1 / 7 days',
    price: 1,
    currency: 'USD',
    durationDays: 7,
    description: 'Unlimited PDF editing for 7 days',
  },
  'pro-monthly': {
    id: 'pro-monthly',
    name: '$3 / month',
    price: 3,
    currency: 'USD',
    durationDays: 30,
    description: 'Unlimited PDF editing for 30 days',
  },
} as const satisfies Record<string, Plan>;

export type PlanId = keyof typeof PLANS;

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Returns null for anything that is not a known plan id. */
export function getPlan(id: unknown): Plan | null {
  if (typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(PLANS, id) ? PLANS[id as PlanId] : null;
}

export function listPlans(): Plan[] {
  return PLAN_IDS.map((id) => PLANS[id]);
}

/** How many days of access a plan grants, used to set the expiry server-side. */
export function expiryFromNow(durationDays: number, from = Date.now()): number {
  return from + durationDays * 24 * 60 * 60 * 1000;
}
