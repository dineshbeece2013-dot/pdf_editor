import React, { useEffect, useState } from 'react';
import { Check, Crown, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { useAuth } from '../context/AuthContext';
import { SUBSCRIPTION_PLANS, type PlanId } from '../services/subscription';
import { gatewayApi, startRazorpayCheckout, subscriptionApi } from '../services/razorpay';
import { messageFor } from '../services/api';

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional headline shown when the modal opens due to the daily limit. */
  reason?: string;
  onSubscribed?: (planId: PlanId) => void;
}

const PLAN_ORDER: PlanId[] = ['pro-weekly', 'pro-monthly'];

const FEATURES = [
  'Unlimited PDF edits',
  'Add text, shapes, signatures & images',
  'Redact, highlight, crop & annotate',
  'Priority export — no daily limit',
];

/**
 * Subscription purchase flow. Opens Razorpay Standard Checkout for the chosen
 * plan and, on success, activates the plan locally + logs the payment.
 */
export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, reason, onSubscribed }) => {
  const { user, applyServerUser } = useAuth();
  const [selected, setSelected] = useState<PlanId>('pro-monthly');
  const [status, setStatus] = useState<'idle' | 'processing' | 'error' | 'success'>('idle');
  const [message, setMessage] = useState('');
  const [gatewayReady, setGatewayReady] = useState<boolean | null>(null);

  const plan = SUBSCRIPTION_PLANS[selected];
  const currencySymbol = String(plan.currency) === 'INR' ? '\u20b9' : '$';

  // Whether real checkout is possible is decided by the server's stored
  // configuration, not by anything bundled into this page.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void gatewayApi
      .get()
      .then((cfg) => {
        if (!cancelled) setGatewayReady(cfg.isConfigured);
      })
      .catch(() => {
        if (!cancelled) setGatewayReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleRazorpay = async () => {
    if (!user) return;
    setStatus('processing');
    setMessage('');

    try {
      // 1. The server creates and prices the order.
      const order = await subscriptionApi.createOrder(selected);

      // 2. The browser opens checkout with that order's amount.
      const result = await startRazorpayCheckout({
        order,
        userName: user.name,
        userEmail: user.email,
      });
      if (!result.success || !result.payment) {
        setStatus('error');
        setMessage(result.error ?? 'Payment could not be completed.');
        return;
      }

      // 3. The server verifies Razorpay's signature before granting access.
      const verified = await subscriptionApi.verify(result.payment);
      if (verified.user) applyServerUser(verified.user);

      setStatus('success');
      setMessage('');
      onSubscribed?.(selected);
    } catch (err) {
      setStatus('error');
      setMessage(messageFor(err));
    }
  };

  /**
   * Sandbox shortcut so the flow is testable without live keys. It is refused
   * by the server when demo payments are disabled (always, in production).
   */
  const handleDemo = async () => {
    if (!user) return;
    setStatus('processing');
    setMessage('');
    try {
      const res = await subscriptionApi.demo(selected);
      if (res.user) applyServerUser(res.user);
      setStatus('success');
      setMessage('');
      onSubscribed?.(selected);
    } catch (err) {
      setStatus('error');
      setMessage(messageFor(err));
    }
  };

  const reset = () => {
    setStatus('idle');
    setMessage('');
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Upgrade to Pro" maxWidth="max-w-2xl">
      {status === 'success' ? (
        <div className="text-center py-6">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-neutral-800">You&apos;re on Pro!</h3>
          <p className="text-sm text-neutral-500 mt-1">
            {SUBSCRIPTION_PLANS[selected].name} is now active. Enjoy unlimited editing.
          </p>
          <button
            onClick={close}
            className="mt-5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm"
          >
            Start editing
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {reason && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </div>
          )}

          <p className="text-sm text-neutral-500">
            You get <b className="text-neutral-700">1 free edit per day</b>. Upgrade for unlimited editing.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            {PLAN_ORDER.map((id) => {
              const p = SUBSCRIPTION_PLANS[id];
              const active = selected === id;
              const sym = String(p.currency) === 'INR' ? '\u20b9' : '$';
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setSelected(id); reset(); }}
                  className={
                    'text-left rounded-xl border-2 p-4 transition-colors ' +
                    (active
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-neutral-700 flex items-center gap-1.5">
                      <Crown className={'w-4 h-4 ' + (active ? 'text-emerald-600' : 'text-neutral-400')} />
                      {id === 'pro-monthly' ? 'Monthly' : 'Weekly'}
                    </span>
                    {id === 'pro-monthly' && (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                        Best value
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-neutral-900 tabular-nums">
                      {sym}
                      {p.price}
                    </span>
                    <span className="text-xs text-neutral-500">/ {p.durationDays} days</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">{p.description}</p>
                </button>
              );
            })}
          </div>

          <ul className="grid sm:grid-cols-2 gap-1.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-neutral-600">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {status === 'error' && message && (
            <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              {message}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <button
              onClick={handleRazorpay}
              disabled={status === 'processing'}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
            >
              {status === 'processing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" /> Pay {currencySymbol}
                  {plan.price} with Razorpay
                </>
              )}
            </button>

            <button
              onClick={handleDemo}
              disabled={status === 'processing'}
              className="w-full py-2 text-xs font-semibold text-neutral-500 hover:text-emerald-600"
            >
              Complete demo payment (sandbox — no real charge)
            </button>
          </div>

          {gatewayReady === false && (
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              Razorpay is not configured on this server. An administrator can add test keys in the admin
              dashboard → Razorpay, or use the demo payment to try the flow.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};

export default UpgradeModal;
