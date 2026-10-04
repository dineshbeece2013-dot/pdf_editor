import type { AppUser } from './localAuth';

/** Subscription plan definitions */
export const SUBSCRIPTION_PLANS = {
  'pro-weekly': {
    id: 'pro-weekly',
    name: '$1 / 7 days',
    price: 1,
    currency: 'USD' as const,
    durationDays: 7,
    description: 'Unlimited PDF editing for 7 days',
  },
  'pro-monthly': {
    id: 'pro-monthly',
    name: '$3 / month',
    price: 3,
    currency: 'USD' as const,
    durationDays: 30,
    description: 'Unlimited PDF editing for 30 days',
  },
} as const;

export type PlanId = keyof typeof SUBSCRIPTION_PLANS;

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

/** Apply a subscription to a user. */
export function applySubscription(user: AppUser, planId: PlanId): AppUser {
  const plan = SUBSCRIPTION_PLANS[planId];
  const now = Date.now();
  const expiresAt = now + (plan.durationDays * 24 * 60 * 60 * 1000);
  
  return {
    ...user,
    plan: 'pro',
    subscriptionPlan: planId,
    subscriptionExpiresAt: expiresAt,
    // Reset free edits on new subscription
    freeEditsUsedToday: 0,
    lastFreeEditDate: todayString(),
  };
}

/** Cancel a user's subscription (revert to free tier). */
export function cancelSubscription(user: AppUser): AppUser {
  return {
    ...user,
    plan: 'free',
    subscriptionPlan: null,
    subscriptionExpiresAt: null,
  };
}

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
    const plan = SUBSCRIPTION_PLANS[user.subscriptionPlan as PlanId];
    const daysRemaining = Math.max(0, Math.ceil((user.subscriptionExpiresAt! - Date.now()) / (24 * 60 * 60 * 1000)));
    return {
      isPro: true,
      planName: plan.name,
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