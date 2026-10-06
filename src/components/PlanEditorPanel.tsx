import React, { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, RotateCcw, Tags } from 'lucide-react';
import { adminApi, type PlanPatch } from '../services/localAuth';
import { formatPrice, type PlanSummary } from '../services/subscription';
import { messageFor } from '../services/api';

const CURRENCIES = ['INR', 'USD'];

const PERIODS = [
  { days: 1, label: 'Daily (1 day)' },
  { days: 7, label: 'Weekly (7 days)' },
  { days: 30, label: 'Monthly (30 days)' },
  { days: 90, label: 'Quarterly (90 days)' },
  { days: 365, label: 'Yearly (365 days)' },
];

interface Draft extends PlanPatch {
  priceText: string;
}

/**
 * Admin editor for the subscription catalogue: price, currency and period.
 * Saving writes straight to the stored plans table, which is also what
 * checkout prices from — the figure shown here is the figure charged.
 */
export const PlanEditorPanel: React.FC = () => {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await adminApi.listPlans();
      setPlans(res.plans);
      setDrafts(Object.fromEntries(res.plans.map((p) => [p.id, { priceText: String(p.price) }])));
      setLoaded(true);
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], priceText: '', ...patch } }));
    setNotice('');
  };

  const handleSave = async (plan: PlanSummary) => {
    const draft = drafts[plan.id] ?? { priceText: String(plan.price) };
    const patch: PlanPatch = {};
    if (draft.name !== undefined && draft.name !== plan.name) patch.name = draft.name;
    if (draft.priceText.trim() !== '' && Number(draft.priceText) !== plan.price) {
      patch.price = Number(draft.priceText);
    }
    if (draft.currency !== undefined && draft.currency !== plan.currency) patch.currency = draft.currency;
    if (draft.durationDays !== undefined && draft.durationDays !== plan.durationDays) {
      patch.durationDays = draft.durationDays;
    }
    if (Object.keys(patch).length === 0) {
      setNotice('No changes to save.');
      return;
    }
    setBusyId(plan.id);
    setError('');
    try {
      const res = await adminApi.updatePlan(plan.id, patch);
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? res.plan : p)));
      setDrafts((prev) => ({ ...prev, [plan.id]: { priceText: String(res.plan.price) } }));
      setNotice(`${res.plan.name} saved — checkout now charges ${formatPrice(res.plan)}.`);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <Tags className="w-4 h-4 text-emerald-600" />
        <h2 className="text-xl font-bold text-neutral-800">Subscription Plans</h2>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Price, currency and billing period. Saving updates the checkout immediately — amounts
        are charged exactly as shown here.
      </p>
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs mb-3">
          {error}
        </div>
      )}
      {notice && (
        <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs mb-3">
          {notice}
        </div>
      )}
      {!loaded ? (
        <p className="text-xs text-neutral-400">Loading plans…</p>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => {
            const d = drafts[p.id] ?? { priceText: String(p.price) };
            const period = p.durationDays === 1 ? 'day' : p.durationDays === 7 ? 'week' : p.durationDays === 30 ? 'month' : `${p.durationDays}d`;
            return (
              <div key={p.id} className="p-4 rounded-lg bg-neutral-50 border border-neutral-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-sm text-neutral-800">{p.name}</div>
                    <div className="text-[11px] text-neutral-400 font-mono">{p.id}</div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">
                    {formatPrice(p)} / {period}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Price</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={d.priceText}
                      onChange={(e) => setDraft(p.id, { priceText: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:border-emerald-500 focus:outline-none tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Currency</label>
                    <select
                      value={d.currency ?? p.currency}
                      onChange={(e) => setDraft(p.id, { currency: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:border-emerald-500 focus:outline-none bg-white"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Billing period</label>
                    <select
                      value={d.durationDays ?? p.durationDays}
                      onChange={(e) => setDraft(p.id, { durationDays: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:border-emerald-500 focus:outline-none bg-white"
                    >
                      {PERIODS.map((per) => (
                        <option key={per.days} value={per.days}>
                          {per.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Display name</label>
                    <input
                      type="text"
                      value={d.name ?? p.name}
                      onChange={(e) => setDraft(p.id, { name: e.target.value })}
                      maxLength={40}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => void handleSave(p)}
                    disabled={busyId === p.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold"
                  >
                    <Check className="w-4 h-4" />
                    {busyId === p.id ? 'Saving…' : 'Save plan'}
                  </button>
                  <button
                    onClick={() => {
                      setDrafts((prev) => ({ ...prev, [p.id]: { priceText: String(p.price) } }));
                      setNotice('');
                      setError('');
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 border border-neutral-200 text-neutral-600 rounded-lg text-sm font-medium hover:bg-white"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Discard
                  </button>
                  <span className="text-[11px] text-neutral-400 ml-auto flex items-center gap-1">
                    <Pencil className="w-3 h-3" />
                    {p.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlanEditorPanel;

