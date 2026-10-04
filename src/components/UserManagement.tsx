import React, { useCallback, useState } from 'react';
import { RefreshCw, ShieldCheck, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listUsers, persistUsers } from '../services/localAuth';
import type { AppUser } from '../services/localAuth';
import { getSubscriptionStatus } from '../services/subscription';

/** Admin user directory: promote/demote roles, reset free edits and delete accounts. */
export const UserManagement: React.FC = () => {
  const { user: currentUser, adminUpdateUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>(() => listUsers());

  const refresh = useCallback(() => setUsers(listUsers()), []);

  const handleRoleToggle = (target: AppUser) => {
    if (target.id === currentUser?.id) return; // never demote yourself
    adminUpdateUser(target.id, { role: target.role === 'admin' ? 'user' : 'admin' });
    refresh();
  };

  const handleDelete = (target: AppUser) => {
    if (target.id === currentUser?.id) return; // never delete yourself
    persistUsers(listUsers().filter((u) => u.id !== target.id));
    refresh();
  };

  const handleResetEdits = (target: AppUser) => {
    adminUpdateUser(target.id, { freeEditsUsedToday: 0, lastFreeEditDate: null });
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-800">User Management</h2>
          <p className="text-xs text-neutral-500">
            {users.length} account{users.length === 1 ? '' : 's'} registered.
          </p>
        </div>
        <button
          onClick={refresh}
          title="Refresh"
          className="p-2 rounded-lg border border-neutral-200 text-neutral-500 hover:text-emerald-600 hover:bg-neutral-50"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-x-auto bg-white border border-neutral-200 rounded-lg shadow-sm">
        <table className="min-w-full">
          <thead className="bg-neutral-100">
            <tr>
              {['Name', 'Email', 'Role', 'Plan', 'Status', 'Expires', 'Actions'].map((h) => (
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
              const isSelf = u.id === currentUser?.id;
              return (
                <tr key={u.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-800 whitespace-nowrap">
                    {u.name}
                    {isSelf && <span className="ml-2 text-[10px] text-emerald-600 font-semibold">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.role === 'admin' ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        Admin
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                        User
                      </span>
                    )}
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
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRoleToggle(u)}
                        disabled={isSelf}
                        title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100 disabled:opacity-40"
                      >
                        {u.role === 'admin' ? <UserMinus className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                        {u.role === 'admin' ? 'Demote' : 'Promote'}
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
                        onClick={() => handleDelete(u)}
                        disabled={isSelf}
                        title="Delete account"
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-40"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
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

export default UserManagement;
