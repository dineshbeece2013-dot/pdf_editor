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

/**
 * Starting prices. Seeded into `subscription_plans` on boot; later edits live
 * in the database so an admin can change price, currency and period from the
 * dashboard without a deploy.
 *
 * Amounts are plain numbers. Currency symbols are added only when rendering,
 * so this file stays ASCII and cannot be corrupted by a line-ending conversion.
 */
export const DEFAULT_PLANS: readonly Plan[] = [
  {
    id: 'pro-daily',
    name: 'Daily',
    price: 19,
    currency: 'INR',
    durationDays: 1,
    description: 'Unlimited PDF editing for 1 day',
  },
  {
    id: 'pro-monthly',
    name: 'Monthly',
    price: 99,
    currency: 'INR',
    durationDays: 30,
    description: 'Unlimited PDF editing for 30 days',
  },
];

export const PLAN_ID_RE = /^pro-[a-z0-9-]{1,32}$/;

export const ALLOWED_CURRENCIES = ['INR', 'USD'] as const;

/** Periods the admin form may assign. Custom day counts are not accepted. */
export const ALLOWED_PERIODS = [1, 7, 30, 90, 365] as const;

/** How many days of access a plan grants, used to set the expiry server-side. */
export function expiryFromNow(durationDays: number, from = Date.now()): number {
  return from + durationDays * 24 * 60 * 60 * 1000;
}

export function periodLabel(durationDays: number): string {
  if (durationDays === 1) return 'day';
  if (durationDays === 7) return 'week';
  if (durationDays === 30) return 'month';
  if (durationDays === 90) return 'quarter';
  if (durationDays === 365) return 'year';
  return `${durationDays} days`;
}

/**
 * Invoice-style label that follows the current price, so renaming the price in
 * the dashboard does not leave a stale "$1 / week" label on the receipt.
 */
export function planDisplayName(plan: Pick<Plan, 'name' | 'price' | 'currency' | 'durationDays'>): string {
  const symbol = plan.currency === 'INR' ? 'Rs ' : plan.currency === 'USD' ? '$' : `${plan.currency} `;
  const amount = Number.isInteger(plan.price) ? String(plan.price) : plan.price.toFixed(2);
  return `${plan.name} · ${symbol}${amount} / ${periodLabel(plan.durationDays)}`;
}
