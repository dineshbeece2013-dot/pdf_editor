import React from 'react';
import type { AppUser } from '../services/localAuth';
import { getSubscriptionStatus } from '../services/subscription';

export interface PlanDistributionChartProps {
  users: AppUser[];
}

/**
 * Compact plan-mix summary for the admin subscriptions tab: a stacked bar plus
 * legend showing how the active accounts break down across Admin / Pro / Free.
 */
export const PlanDistributionChart: React.FC<PlanDistributionChartProps> = ({ users }) => {
  const counts = users.reduce(
    (acc, u) => {
      if (u.role === 'admin') acc.admin += 1;
      else if (getSubscriptionStatus(u).isPro) acc.pro += 1;
      else acc.free += 1;
      return acc;
    },
    { admin: 0, pro: 0, free: 0 },
  );

  const total = users.length || 1;
  const pct = (n: number) => (n / total) * 100;

  const legend = [
    { label: 'Admin', value: counts.admin, color: 'bg-blue-500' },
    { label: 'Pro', value: counts.pro, color: 'bg-emerald-500' },
    { label: 'Free', value: counts.free, color: 'bg-neutral-300' },
  ];

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-700">Plan distribution</h3>
        <span className="text-xs text-neutral-400">{users.length} account{users.length === 1 ? '' : 's'}</span>
      </div>

      <div className="h-3 w-full rounded-full overflow-hidden flex bg-neutral-100">
        {legend.map((l) =>
          l.value > 0 ? (
            <div key={l.label} className={l.color} style={{ width: `${pct(l.value)}%` }} title={`${l.label}: ${l.value}`} />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap gap-4 mt-3">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={'w-2.5 h-2.5 rounded-full ' + l.color} />
            <span className="text-xs text-neutral-600">
              {l.label} <b className="text-neutral-800 tabular-nums">{l.value}</b>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanDistributionChart;
