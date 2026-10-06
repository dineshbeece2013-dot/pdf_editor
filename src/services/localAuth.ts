import { api } from './api';
import type { PlanSummary } from './subscription';

export interface PlanPatch {
  name?: string;
  price?: number;
  currency?: string;
  durationDays?: number;
  description?: string;
  active?: boolean;
}

/**
 * Accounts API client.
 *
 * Replaces the old localStorage store. The shapes (`AppUser`, the admin patch
 * fields) are unchanged so the editor and admin UI keep working — the one
 * deliberate difference is that there is no `password` field any more. The
 * server hashes with Argon2id and never returns the value in any form.
 */

export type SubscriptionPlan = 'free' | 'pro-daily' | 'pro-weekly' | 'pro-monthly' | null;

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  plan: 'free' | 'pro';
  createdAt: number;
  // Subscription fields
  subscriptionPlan?: SubscriptionPlan;
  subscriptionExpiresAt?: number | null;
  // Daily free edit tracking
  freeEditsUsedToday?: number;
  lastFreeEditDate?: string | null; // YYYY-MM-DD
  // Stats
  totalEdits?: number;
}

/** Fields an admin is allowed to change — enforced again on the server. */
export interface AdminUserPatch {
  name?: string;
  role?: 'admin' | 'user';
  plan?: 'free' | 'pro';
  subscriptionPlan?: SubscriptionPlan;
  subscriptionExpiresAt?: number | null;
  freeEditsUsedToday?: number;
  lastFreeEditDate?: string | null;
  totalEdits?: number;
}

/** The server's verdict on whether this account may record an edit. */
export interface EditAccess {
  canEdit: boolean;
  reason?: string;
  remainingFreeEdits: number;
  isPro: boolean;
  planName: string;
  daysRemaining: number | null;
}

export interface MeResponse {
  user: AppUser | null;
  passwordPolicy: { minLength: number };
}

/** Everything the signed-in user needs. */
export const authApi = {
  me: () => api.get<MeResponse>('/auth/me'),

  login: (email: string, password: string) =>
    api.post<{ user: AppUser }>('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    api.post<{ user: AppUser }>('/auth/register', { name, email, password }),

  logout: () => api.post<{ ok: true }>('/auth/logout'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ ok: true }>('/auth/password', { currentPassword, newPassword }),
};

/** The signed-in user's own quota and counter. */
export const meApi = {
  editAccess: () => api.get<{ access: EditAccess }>('/me/edit-access'),
  recordEdit: () => api.post<{ user: AppUser; access: EditAccess }>('/me/edits'),
};

/** Administrator operations. Every call here is authorised server-side. */
export const adminApi = {
  listUsers: () => api.get<{ users: AppUser[] }>('/admin/users'),
  updateUser: (id: string, patch: AdminUserPatch) =>
    api.patch<{ user: AppUser }>(`/admin/users/${id}`, patch),
  deleteUser: (id: string) => api.delete<{ ok: true }>(`/admin/users/${id}`),
  resetEdits: (id: string) => api.post<{ user: AppUser }>(`/admin/users/${id}/reset-edits`),
  grantSubscription: (id: string, planId: string) =>
    api.post<{ user: AppUser }>(`/admin/users/${id}/grant`, { planId }),
  cancelSubscription: (id: string) => api.post<{ user: AppUser }>(`/admin/users/${id}/cancel`),
  listPlans: () => api.get<{ plans: PlanSummary[] }>(`/admin/plans`),
  updatePlan: (id: string, patch: PlanPatch) =>
    api.patch<{ plan: PlanSummary }>(`/admin/plans/${id}`, patch),
};

/**
 * Drop any browser-held copy of the data the old localStorage version kept.
 * Those keys held plaintext passwords and a payment ledger, so it is worth
 * clearing them out of existing browsers on first load.
 */
export function purgeLegacyLocalData(): void {
  try {
    for (const key of ['pdfpro.users', 'pdfpro.session', 'pdfpro.payments', 'pdfpro.razorpay']) {
      localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}
