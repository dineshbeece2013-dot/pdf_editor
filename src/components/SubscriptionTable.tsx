import React, { useCallback, useState } from 'react';
import { Ban, Calendar, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listUsers } from '../services/localAuth';
import type { AppUser } from '../services/localAuth';
import { PlanDistributionChart } from './PlanDistributionChart';
import {
  applySubscription,
  cancelSubscription,
  getSubscriptionStatus,
  type PlanId,
} from '../services/subscription';

/** Admin view of every account's subscription with quick grant/cancel actions. */
export const SubscriptionTable: React.FC = () => {
  const { adminUpdateUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>(() => listUsers());

  const refresh = useCallback(() => setUsers(listUsers()), []);

  const persist = (updated: AppUser) => {
    adminUpdateUser(updated.id, {
      plan: updated.plan,
      subscriptionPlan: updated.subscriptionPlan,
      subscriptionExpiresAt: updated.subscriptionExpiresAt,
      freeEditsUsedToday: updated.freeEditsUsedToday,
      lastFreeEditDate: updated.lastFreeEditDate,
    });
    refresh();
  };

  const handleGrant = (target: AppUser, planId: PlanId) => persist(applySubscription(target, planId));
  const handleCancel = (target: AppUser) => persist(cancelSubscription(target));
  const handleResetEdits = (target: AppUser) => {
    adminUpdateUser(target.id, { freeEditsUsedToday: 0, lastFreeEditDate: null });
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-800">Subscriptions</h2>
          <p className="text-xs text-neutral-500">Grant or revoke Pro access for any account.</p>
        </div>
        <button
          onClick={refresh}
          title="Refresh"
          className="p-2 rounded-lg border border-neutral-200 text-neutral-500 hover:text-emerald-600 hover:bg-neutral-50"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <PlanDistributionChart users={users} />

      <div className="overflow-x-auto bg-white border border-neutral-200 rounded-lg shadow-sm">
        <table className="min-w-full">
          <thead className="bg-neutral-100">
            <tr>
              {['Email', 'Role', 'Plan', 'Status', 'Expires', 'Edits Today', 'Total Edits', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {users.map((u) => {
              const status = getSubscriptionStatus(u);
              return (
                <tr key={u.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-800 whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={
                        'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ' +
                        (u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-600')
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-700 whitespace-nowrap">{status.planName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {status.isPro ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">
                    {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap tabular-nums">
                    {u.freeEditsUsedToday ?? 0}/1
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap tabular-nums">
                    {u.totalEdits ?? 0}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleGrant(u, 'pro-weekly')}
                        title="Grant $1 / 7 days"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100"
                      >
                        <Calendar className="w-3 h-3" />
                        7d
                      </button>
                      <button
                        onClick={() => handleGrant(u, 'pro-monthly')}
                        title="Grant $3 / month"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100"
                      >
                        <Calendar className="w-3 h-3" />
                        30d
                      </button>
                      <button
                        onClick={() => handleResetEdits(u)}
                        title="Reset today's free edits"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold hover:bg-amber-100"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        Reset
                      </button>
                      <button
                        onClick={() => handleCancel(u)}
                        disabled={!status.isPro || u.role === 'admin'}
                        title="Cancel subscription"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-40"
                      >
                        <Ban className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SubscriptionTable;
