import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authApi,
  meApi,
  purgeLegacyLocalData,
  type AppUser,
  type EditAccess,
} from '../services/localAuth';
import { subscriptionApi } from '../services/razorpay';
import { getSubscriptionStatus } from '../services/subscription';

interface SubscriptionStatus {
  isPro: boolean;
  planName: string | null;
  expiresAt: number | null;
  daysRemaining: number | null;
  canEdit: boolean;
  editLimitReason?: string;
}

/** A visitor who is not signed in keeps the full editing access they always had. */
const GUEST_STATUS: SubscriptionStatus = {
  isPro: false,
  planName: null,
  expiresAt: null,
  daysRemaining: null,
  canEdit: true,
};

interface AuthContextValue {
  user: AppUser | null;
  /** True until the initial "who am I?" request settles. */
  loading: boolean;
  passwordMinLength: number;
  subscriptionStatus: SubscriptionStatus;
  canEditResult: { canEdit: boolean; reason?: string };
  login: (email: string, password: string) => Promise<AppUser>;
  register: (name: string, email: string, password: string) => Promise<AppUser>;
  logout: () => Promise<void>;
  recordEdit: () => void;
  /** Adopt a user record the server just returned (after a payment, say). */
  applyServerUser: (user: AppUser | null) => void;
  refreshEditAccess: () => Promise<void>;
  cancelPro: () => Promise<AppUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<EditAccess | null>(null);
  const [passwordMinLength, setPasswordMinLength] = useState(8);

  const loadAccess = useCallback(async () => {
    try {
      const res = await meApi.editAccess();
      setAccess(res.access);
    } catch {
      setAccess(null);
    }
  }, []);

  /**
   * The session lives in an httpOnly cookie, which JavaScript cannot read, so
   * this GET is the only way the app learns who (if anyone) is signed in. It
   * also clears out the data the old localStorage version left behind.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      purgeLegacyLocalData();
      try {
        const res = await authApi.me();
        if (cancelled) return;
        setUser(res.user);
        setPasswordMinLength(res.passwordPolicy?.minLength ?? 8);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Ask the server for the authoritative quota once we know there is a user.
  useEffect(() => {
    if (user) void loadAccess();
  }, [user, loadAccess]);

  const applyServerUser = useCallback(
    (next: AppUser | null) => {
      setUser(next);
      if (next) void loadAccess();
      else setAccess(null);
    },
    [loadAccess],
  );

  /**
   * Confirm the browser actually kept the session cookie.
   *
   * `POST /auth/login` can return 200 with the user while the cookie is not
   * stored — behind a misconfigured proxy, or with cookies blocked. The UI
   * would then show "signed in" from the response body while every later
   * request 401s, which surfaces much later as a confusing "Sign in required."
   * halfway through checkout. One extra round trip turns that into an
   * immediate, honest error.
   */
  const confirmSession = async (): Promise<void> => {
    const me = await authApi.me();
    if (me.user) return;
    throw new Error(
      'Sign-in did not complete: your browser did not keep the session cookie. ' +
        'Check that cookies are enabled for this site and that you are on https://, then try again.',
    );
  };

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      await confirmSession();
      applyServerUser(res.user);
      return res.user;
    },
    [applyServerUser],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await authApi.register(name, email, password);
      await confirmSession();
      applyServerUser(res.user);
      return res.user;
    },
    [applyServerUser],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    applyServerUser(null);
  }, [applyServerUser]);

  /**
   * Called the moment an edit starts. The counter is bumped optimistically so
   * the editor never waits on a round trip; the server response then becomes
   * the truth. If the server refuses the edit we re-read the real allowance so
   * the upgrade prompt appears at the right moment.
   */
  const recordEdit = useCallback(() => {
    if (!user) return;

    setUser((prev) => (prev ? { ...prev, totalEdits: (prev.totalEdits ?? 0) + 1 } : prev));

    void meApi
      .recordEdit()
      .then((res) => {
        setUser(res.user);
        setAccess(res.access);
      })
      .catch(() => {
        void loadAccess();
      });
  }, [user, loadAccess]);

  const cancelPro = useCallback(async () => {
    const res = await subscriptionApi.cancel();
    applyServerUser(res.user);
    return res.user;
  }, [applyServerUser]);

  const subscriptionStatus = useMemo<SubscriptionStatus>(() => {
    if (!user) return GUEST_STATUS;
    if (access) {
      return {
        isPro: access.isPro,
        planName: access.planName,
        expiresAt: user.subscriptionExpiresAt ?? null,
        daysRemaining: access.daysRemaining,
        canEdit: access.canEdit,
        editLimitReason: access.reason,
      };
    }
    // Brief window before the server's verdict arrives.
    return getSubscriptionStatus(user);
  }, [user, access]);

  const canEditResult = useMemo(() => {
    if (!user) return { canEdit: true };
    if (access) return { canEdit: access.canEdit, reason: access.reason };
    return { canEdit: true };
  }, [user, access]);

  const value = useMemo(
    () => ({
      user,
      loading,
      passwordMinLength,
      subscriptionStatus,
      canEditResult,
      login,
      register,
      logout,
      recordEdit,
      applyServerUser,
      refreshEditAccess: loadAccess,
      cancelPro,
    }),
    [
      user,
      loading,
      passwordMinLength,
      subscriptionStatus,
      canEditResult,
      login,
      register,
      logout,
      recordEdit,
      applyServerUser,
      loadAccess,
      cancelPro,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};