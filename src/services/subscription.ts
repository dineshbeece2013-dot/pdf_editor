import type { AppUser } from './localAuth';

/**
 * A plan as the server prices it, returned by GET /api/subscription/plans.
 *
 * Money values are deliberately NOT hardcoded in this file. The browser never
 * decides what a plan costs, so it must not advertise a cost either — the
 * number rendered here is the exact number the server charges. Keeping a
 * second copy of the price in the bundle is how a UI ends up quoting a plan at
 * a different price to the one on the invoice.
 */
export interface PlanSummary {
  id: string;
  name: string;
  price: number;
  currency: string;
  durationDays: number;
  description: string;
}

/** Short labels for plan ids, used where no amount needs to be shown. */
export const PLAN_LABELS = {
  'pro-daily': 'Daily',
  'pro-monthly': 'Monthly',
} as const;

export type PlanId = keyof typeof PLAN_LABELS;

/** Display order in the upgrade dialog. */
export const PLAN_ORDER: PlanId[] = ['pro-daily', 'pro-monthly'];

/**
 * Plan ids that have been retired from the catalogue but can still exist on
 * stored subscriptions or payment rows. They keep their old label so an
 * existing subscriber never sees a raw id in the UI.
 */
const LEGACY_PLAN_LABELS: Record<string, string> = {
  'pro-weekly': 'Weekly',
};

/**
 * A human label for a stored plan id.
 *
 * Falls back to the raw id for anything unrecognised, so a subscription bought
 * under a retired plan still renders a name instead of "undefined".
 */
export function planLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return PLAN_LABELS[id as PlanId] ?? LEGACY_PLAN_LABELS[id] ?? id;
}

/** Format an amount for display, e.g. { price: 3, currency: 'USD' } -> "$3". */
export function formatPrice(plan: Pick<PlanSummary, 'price' | 'currency'>): string {
  return plan.currency === 'INR' ? `\u20b9${plan.price}` : `$${plan.price}`;
}

const FREE_EDITS_PER_DAY = 1;

/** Get today's date string in YYYY-MM-DD format (local timezone). */
function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

/** Check if a user's pro subscription is currently active. */
export function isSubscriptionActive(user: AppUser): boolean {
  if (!user.subscriptionPlan || !user.subscriptionExpiresAt) return false;
  return user.subscriptionExpiresAt > Date.now();
}

/** Check if a user can perform an edit action. */
export function canUserEdit(user: AppUser): { canEdit: boolean; reason?: string; remainingFreeEdits?: number } {
  // Admin always has access
  if (user.role === 'admin') {
    return { canEdit: true };
  }

  // Active pro subscription = unlimited edits
  if (isSubscriptionActive(user)) {
    return { canEdit: true };
  }

  // Free tier: check daily limit
  const today = todayString();
  
  // Reset counter if it's a new day
  if (user.lastFreeEditDate !== today) {
    return { 
      canEdit: true, 
      remainingFreeEdits: FREE_EDITS_PER_DAY 
    };
  }

  const used = user.freeEditsUsedToday ?? 0;
  const remaining = Math.max(0, FREE_EDITS_PER_DAY - used);
  
  if (remaining > 0) {
    return { canEdit: true, remainingFreeEdits: remaining };
  }

  return { 
    canEdit: false, 
    reason: `You've used your ${FREE_EDITS_PER_DAY} free edit for today. Subscribe for unlimited editing.`,
    remainingFreeEdits: 0 
  };
}

/** Record that the user performed an edit. Returns the updated user. */
export function recordUserEdit(user: AppUser): AppUser {
  const today = todayString();
  
  // If subscription is active, just increment totalEdits
  if (isSubscriptionActive(user)) {
    return {
      ...user,
      totalEdits: (user.totalEdits ?? 0) + 1,
    };
  }

  // Free tier: check if new day
  if (user.lastFreeEditDate !== today) {
    return {
      ...user,
      freeEditsUsedToday: 1,
      lastFreeEditDate: today,
      totalEdits: (user.totalEdits ?? 0) + 1,
    };
  }

  // Same day, increment counter
  return {
    ...user,
    freeEditsUsedToday: (user.freeEditsUsedToday ?? 0) + 1,
    totalEdits: (user.totalEdits ?? 0) + 1,
  };
}

/**
 * Deliberately absent: a client-side `applySubscription`/`cancelSubscription`.
 *
 * An earlier localStorage build mutated the cached user to flip `plan` to 'pro'.
 * Entitlements are now granted server-side and only after Razorpay's signature
 * is verified, so a client-side helper would be both dead code and a way to
 * fake access. Use the API instead (`subscriptionApi.verify` / `.cancel`).
 */

/** Get human-readable subscription status for UI. */
export function getSubscriptionStatus(user: AppUser): {
  isPro: boolean;
  planName: string | null;
  expiresAt: number | null;
  daysRemaining: number | null;
  canEdit: boolean;
  editLimitReason?: string;
  remainingFreeEdits?: number;
} {
  const editCheck = canUserEdit(user);
  
  if (user.role === 'admin') {
    return {
      isPro: true,
      planName: 'Admin (Unlimited)',
      expiresAt: null,
      daysRemaining: null,
      canEdit: true,
    };
  }

  if (isSubscriptionActive(user) && user.subscriptionPlan) {
    const daysRemaining = Math.max(0, Math.ceil((user.subscriptionExpiresAt! - Date.now()) / (24 * 60 * 60 * 1000)));
    return {
      isPro: true,
      planName: planLabel(user.subscriptionPlan) ?? user.subscriptionPlan,
      expiresAt: user.subscriptionExpiresAt!,
      daysRemaining,
      canEdit: true,
    };
  }

  // Free tier
  const today = todayString();
  const used = user.lastFreeEditDate === today ? (user.freeEditsUsedToday ?? 0) : 0;

  return {
    isPro: false,
    planName: 'Free',
    expiresAt: null,
    daysRemaining: null,
    canEdit: editCheck.canEdit,
    editLimitReason: editCheck.reason,
    remainingFreeEdits: Math.max(0, FREE_EDITS_PER_DAY - used),
  };
}

/** Format a timestamp as a readable date string. */
export function formatExpiryDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}