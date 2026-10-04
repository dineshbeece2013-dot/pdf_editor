import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Crown, LayoutDashboard, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatExpiryDate } from '../services/subscription';
import { ACCOUNTS_ENABLED } from '../config';
import { LOGIN_PATH, navigate } from '../services/router';

export interface AccountMenuProps {
  onOpenUpgrade: () => void;
  onOpenAdmin: () => void;
}

/**
 * Compact account control shown at the top-right of the editor. When nobody is
 * signed in it renders the "Login / Sign Up" entry point that links to /login.
 * Once signed in it surfaces the user, their subscription state, the Pro upgrade
 * entry point and — for admins only — the admin dashboard + sign out.
 */
export const AccountMenu: React.FC<AccountMenuProps> = ({ onOpenUpgrade, onOpenAdmin }) => {
  const { user, subscriptionStatus, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Signed out: a guest. Offer the dedicated login page rather than showing any
  // account chip. Styled to match the neighbouring header buttons and collapses
  // to a short label on narrow screens.
  if (!user) {
    if (!ACCOUNTS_ENABLED) return null;
    return (
      <button
        onClick={() => navigate(LOGIN_PATH)}
        title="Sign in or create an account"
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-100 text-xs font-semibold"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden sm:inline">Login / Sign Up</span>
        <span className="sm:hidden">Login</span>
      </button>
    );
  }

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const isAdmin = user.role === 'admin';
  const isPro = subscriptionStatus.isPro;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 pl-1 pr-1.5 sm:pr-2 py-1 rounded-lg border border-neutral-200 hover:bg-neutral-100"
        title="Account"
      >
        <span className="w-6 h-6 rounded-md bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
          {initial}
        </span>
        <span className="hidden sm:block max-w-[7rem] truncate text-xs font-semibold text-neutral-700">
          {user.name}
        </span>
        {isPro && <Crown className="w-3.5 h-3.5 text-amber-500" />}
        <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-neutral-400" />
              <span className="text-sm font-semibold text-neutral-800 truncate">{user.name}</span>
            </div>
            <p className="text-xs text-neutral-500 truncate mt-0.5">{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={
                  'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ' +
                  (isPro ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600')
                }
              >
                {isAdmin ? 'Admin' : isPro ? 'Pro' : 'Free'}
              </span>
              <span className="text-[11px] text-neutral-500 truncate">
                {isAdmin
                  ? 'Unlimited access'
                  : isPro
                    ? `${subscriptionStatus.planName}${subscriptionStatus.expiresAt ? ' · until ' + formatExpiryDate(subscriptionStatus.expiresAt) : ''}`
                    : '1 free edit / day'}
              </span>
            </div>
          </div>

          <div className="p-1.5">
            {!isPro && (
              <button
                onClick={() => { setOpen(false); onOpenUpgrade(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <Crown className="w-4 h-4" />
                Upgrade to Pro
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => { setOpen(false); onOpenAdmin(); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                <LayoutDashboard className="w-4 h-4" />
                Admin Dashboard
              </button>
            )}

            <button
              onClick={() => { setOpen(false); void logout(); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountMenu;
