import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  type AppUser,
  clearSession,
  createUser,
  findUserByEmail,
  getSessionUserId,
  listUsers,
  seedUsers,
  setSessionUserId,
  updateUserData,
} from '../services/localAuth';
import {
  canUserEdit,
  recordUserEdit,
  getSubscriptionStatus,
  applySubscription,
  cancelSubscription,
  type PlanId,
} from '../services/subscription';

// Idempotent — seeds the demo admin/user accounts on first load.
seedUsers();

type SubscriptionStatus = ReturnType<typeof getSubscriptionStatus>;
type EditCheck = ReturnType<typeof canUserEdit>;

// Someone who is not signed in is a guest. Guests keep the full editing access
// the app has always had, so the editor behaves identically whether or not you
// hold an account — the daily limit and the upgrade prompt only ever apply to
// signed-in free accounts.
const GUEST_SUBSCRIPTION_STATUS: SubscriptionStatus = {
  isPro: false,
  planName: null,
  expiresAt: null,
  daysRemaining: null,
  canEdit: true,
  editLimitReason: undefined,
};

const GUEST_EDIT_CHECK: EditCheck = { canEdit: true };

interface AuthContextValue {
  user: AppUser | null;
  subscriptionStatus: ReturnType<typeof getSubscriptionStatus>;
  canEditResult: ReturnType<typeof canUserEdit>;
  login: (email: string, password: string) => AppUser;
  register: (name: string, email: string, password: string) => AppUser;
  logout: () => void;
  recordEdit: () => void;
  subscribe: (planId: PlanId) => AppUser;
  cancelPro: () => AppUser;
  adminUpdateUser: (id: string, patch: Partial<AppUser>) => AppUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Nobody is signed in automatically: a first-time visitor starts as a guest.
  // We only restore a session that was created by an explicit sign-in.
  const [user, setUser] = useState<AppUser | null>(() => {
    const id = getSessionUserId();
    if (!id) return null;
    return listUsers().find((u) => u.id === id) ?? null;
  });

  const subscriptionStatus = useMemo(
    () => (user ? getSubscriptionStatus(user) : GUEST_SUBSCRIPTION_STATUS),
    [user]
  );

  const canEditResult = useMemo(
    () => (user ? canUserEdit(user) : GUEST_EDIT_CHECK),
    [user]
  );

  const login = (email: string, password: string): AppUser => {
    const found = findUserByEmail(email);
    if (!found || found.password !== password) {
      throw new Error('Invalid email or password.');
    }
    setSessionUserId(found.id);
    setUser(found);
    return found;
  };

  const register = (name: string, email: string, password: string): AppUser => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw new Error('Email is required.');
    if (findUserByEmail(normalized)) {
      throw new Error('An account with this email already exists.');
    }
    const created = createUser({ name: name.trim(), email: normalized, password });
    setSessionUserId(created.id);
    setUser(created);
    return created;
  };

  const logout = (): void => {
    clearSession();
    setUser(null);
  };

  const recordEdit = (): void => {
    if (!user) return;
    const updated = recordUserEdit(user);
    updateUserData(user.id, () => ({
      freeEditsUsedToday: updated.freeEditsUsedToday,
      lastFreeEditDate: updated.lastFreeEditDate,
      totalEdits: updated.totalEdits,
    }));
    setUser((prev) => (prev ? { ...prev, freeEditsUsedToday: updated.freeEditsUsedToday, lastFreeEditDate: updated.lastFreeEditDate, totalEdits: updated.totalEdits } : null));
  };

  const subscribe = (planId: PlanId): AppUser => {
    if (!user) throw new Error('No user logged in.');
    const updated = applySubscription(user, planId);
    updateUserData(user.id, () => ({
      plan: updated.plan,
      subscriptionPlan: updated.subscriptionPlan,
      subscriptionExpiresAt: updated.subscriptionExpiresAt,
      freeEditsUsedToday: updated.freeEditsUsedToday,
      lastFreeEditDate: updated.lastFreeEditDate,
    }));
    setUser((prev) => (prev ? { ...prev, plan: updated.plan, subscriptionPlan: updated.subscriptionPlan, subscriptionExpiresAt: updated.subscriptionExpiresAt, freeEditsUsedToday: updated.freeEditsUsedToday, lastFreeEditDate: updated.lastFreeEditDate } : null));
    return updated;
  };

  const cancelPro = (): AppUser => {
    if (!user) throw new Error('No user logged in.');
    const updated = cancelSubscription(user);
    updateUserData(user.id, () => ({
      plan: updated.plan,
      subscriptionPlan: updated.subscriptionPlan,
      subscriptionExpiresAt: updated.subscriptionExpiresAt,
    }));
    setUser((prev) => (prev ? { ...prev, plan: updated.plan, subscriptionPlan: updated.subscriptionPlan, subscriptionExpiresAt: updated.subscriptionExpiresAt } : null));
    return updated;
  };

  const adminUpdateUser = (id: string, patch: Partial<AppUser>): AppUser | null => {
    if (!user || user.role !== 'admin') return null;
    const updated = updateUserData(id, () => patch);
    if (updated && user.id === id) {
      setUser(updated);
    }
    return updated;
  };

  const value = useMemo(
    () => ({
      user,
      subscriptionStatus,
      canEditResult,
      login,
      register,
      logout,
      recordEdit,
      subscribe,
      cancelPro,
      adminUpdateUser,
    }),
    [user, subscriptionStatus, canEditResult]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};