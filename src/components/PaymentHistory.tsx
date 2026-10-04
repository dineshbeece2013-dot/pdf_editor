import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2, Wallet } from 'lucide-react';
import { paymentsApi, type PaymentRecord } from '../services/payments';
import { messageFor } from '../services/api';
import { formatExpiryDate } from '../services/subscription';

const methodBadge = (method: PaymentRecord['method']) =>
  method === 'razorpay'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-neutral-100 text-neutral-600';

/**
 * Admin view of the payment ledger. The rows and the revenue totals are
 * computed by the backend from payments it verified itself.
 */
export const PaymentHistory: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [revenue, setRevenue] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await paymentsApi.all();
      setPayments(res.payments);
      setRevenue(res.revenue);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClear = async () => {
    setBusy(true);
    setError('');
    try {
      await paymentsApi.clear();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const totalLabel =
    Object.keys(revenue).length === 0
      ? '$0'
      : Object.entries(revenue)
          .map(([cur, amt]) => `${cur === 'INR' ? '\u20b9' : '$'}${amt}`)
          .join(' + ');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-800">Payments</h2>
          <p className="text-xs text-neutral-500">Subscription payments verified by the server.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700 tabular-nums">{totalLabel}</span>
            <span className="text-[11px] text-emerald-600">revenue</span>
          </div>
          <button
            onClick={() => void refresh()}
            title="Refresh"
            className="p-2 rounded-lg border border-neutral-200 text-neutral-500 hover:text-emerald-600 hover:bg-neutral-50"
          >
            <RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          </button>
          <button
            onClick={() => void handleClear()}
            title="Clear ledger"
            className="p-2 rounded-lg border border-neutral-200 text-neutral-500 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
{error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}

      {payments.length === 0 ? (
        <div className="py-12 text-center text-sm text-neutral-400 bg-white border border-neutral-200 rounded-lg">
          No payments recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-neutral-200 rounded-lg shadow-sm">
          <table className="min-w-full">
            <thead className="bg-neutral-100">
              <tr>
                {['Date', 'User', 'Plan', 'Amount', 'Payment ID', 'Method', 'Status'].map((h) => (
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
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">
                    {formatExpiryDate(p.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-700">
                    <div className="font-medium">{p.userName}</div>
                    <div className="text-neutral-400">{p.userEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-700 whitespace-nowrap">{p.planName}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-neutral-800 whitespace-nowrap tabular-nums">
                    {p.currency === 'INR' ? '\u20b9' : '$'}
                    {p.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-neutral-500 font-mono whitespace-nowrap">
                    {p.razorpayPaymentId}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ' + methodBadge(p.method)}>
                      {p.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
