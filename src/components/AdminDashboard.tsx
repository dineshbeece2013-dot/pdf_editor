import React, { useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  Crown,
  KeyRound,
  LayoutDashboard,
  Tags,
  Users as UsersIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserManagement } from './UserManagement';
import { SubscriptionTable } from './SubscriptionTable';
import { PaymentHistory } from './PaymentHistory';
import { RazorpayConfigPanel } from './RazorpayConfigPanel';
import { PlanEditorPanel } from './PlanEditorPanel';

export interface AdminDashboardProps {
  onClose: () => void;
}

type AdminTab = 'users' | 'subscriptions' | 'plans' | 'payments' | 'razorpay';

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'users', label: 'Users', icon: <UsersIcon className="w-4 h-4" /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <Crown className="w-4 h-4" /> },
  { id: 'plans', label: 'Plans', icon: <Tags className="w-4 h-4" /> },
  { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'razorpay', label: 'Razorpay', icon: <KeyRound className="w-4 h-4" /> },
];

/**
 * Full-screen administrator console: manage users, subscriptions, the payment
 * ledger and the Razorpay gateway configuration. Rendered by the editor when
 * an admin opens it from the account menu.
 */
export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');

  if (!user || user.role !== 'admin') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-neutral-100">
        <p className="text-neutral-600 font-medium">Access denied — administrators only.</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
        >
          Back to editor
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-100">
      <header className="h-14 shrink-0 bg-neutral-950 text-white flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 shrink-0 rounded-lg bg-emerald-600 flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4" />
          </span>
          <span className="font-bold text-sm tracking-tight whitespace-nowrap">
            <span className="hidden sm:inline">PDF Editor Pro · </span>
            <span className="text-emerald-400">Admin</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800 whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back to editor</span>
          <span className="sm:hidden">Back</span>
        </button>
      </header>

      {/*
        Tabs: a fixed left sidebar from `sm` up (unchanged desktop console);
        below `sm` they become a horizontally swipeable strip above the panel
        so the table keeps the full screen width instead of ~130px.
      */}
      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
        <aside className="shrink-0 bg-neutral-900 text-neutral-300 p-2 sm:p-3 flex flex-row sm:flex-col gap-1.5 sm:gap-1 overflow-x-auto sm:overflow-x-visible no-scrollbar border-b sm:border-b-0 border-neutral-800 sm:w-56">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'shrink-0 sm:w-full flex items-center gap-2.5 px-3 py-2 sm:py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ' +
                (tab === t.id ? 'bg-emerald-600 text-white' : 'hover:bg-neutral-800')
              }
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </aside>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-5xl mx-auto">
            {tab === 'users' && <UserManagement />}
            {tab === 'subscriptions' && <SubscriptionTable />}
            {tab === 'plans' && <PlanEditorPanel />}
            {tab === 'payments' && <PaymentHistory />}
            {tab === 'razorpay' && <RazorpayConfigPanel />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;