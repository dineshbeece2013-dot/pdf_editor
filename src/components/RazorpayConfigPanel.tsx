import React, { useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, RotateCcw } from 'lucide-react';
import {
  getRazorpayConfig,
  isPlaceholderKey,
  saveRazorpayConfig,
  type RazorpayConfig,
} from '../services/razorpay';
import { SUBSCRIPTION_PLANS } from '../services/subscription';

const FIELDS: { key: keyof RazorpayConfig; label: string; hint: string; secret?: boolean }[] = [
  { key: 'keyId', label: 'Key ID', hint: 'Publishable key — safe to expose (starts with rzp_)' },
  { key: 'keySecret', label: 'Key Secret', hint: 'Used server-side only for signature verification', secret: true },
  { key: 'currency', label: 'Currency', hint: 'e.g. INR or USD' },
];

/**
 * Admin editor for the Razorpay gateway keys. Values are persisted to
 * localStorage and read by the checkout flow. The secret never leaves the
 * browser in this demo — wire it to your server for production.
 */
export const RazorpayConfigPanel: React.FC = () => {
  const [config, setConfig] = useState<RazorpayConfig>(() => getRazorpayConfig());
  const [revealSecret, setRevealSecret] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (key: keyof RazorpayConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveRazorpayConfig(config);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setConfig(getRazorpayConfig());
    setSaved(false);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-emerald-600" />
          <h2 className="text-xl font-bold text-neutral-800">Razorpay Configuration</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Keys used by the Pro checkout. The secret must move to a server before going live.
        </p>

        {isPlaceholderKey() && (
          <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Placeholder keys are active. Add your Razorpay <b>test</b> keys to accept real sandbox payments.
            </span>
          </div>
        )}

        <div className="space-y-4">
          {FIELDS.map((f) => {
            const isSecret = Boolean(f.secret);
            const shown = !isSecret || revealSecret;
            return (
              <div key={f.key}>
                <label className="block text-sm font-medium text-neutral-700 mb-1">{f.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type={shown ? 'text' : 'password'}
                    value={config[f.key]}
                    onChange={(e) => update(f.key, e.target.value)}
                    placeholder={f.label}
                    className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-md focus:border-emerald-500 focus:outline-none font-mono"
                  />
                  {isSecret && (
                    <button
                      type="button"
                      onClick={() => setRevealSecret((v) => !v)}
                      title={revealSecret ? 'Hide' : 'Reveal'}
                      className="p-2 rounded-md border border-neutral-200 text-neutral-500 hover:text-emerald-600 hover:bg-neutral-50"
                    >
                      {revealSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">{f.hint}</p>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
          >
            {saved ? <Check className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
            {saved ? 'Saved' : 'Save keys'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-200 text-neutral-600 rounded-lg text-sm font-medium hover:bg-neutral-50"
          >
            <RotateCcw className="w-4 h-4" />
            Revert
          </button>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-5">
        <h2 className="text-lg font-bold text-neutral-800 mb-3">Subscription Plans</h2>
        <div className="space-y-2">
          {Object.values(SUBSCRIPTION_PLANS).map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-3 rounded-md bg-neutral-50 border border-neutral-100"
            >
              <div>
                <div className="font-semibold text-sm text-neutral-800">{p.name}</div>
                <div className="text-xs text-neutral-500">{p.description}</div>
              </div>
              <span className="text-xs font-bold text-emerald-700 tabular-nums">
                {String(p.currency) === 'INR' ? '\u20b9' : '$'}
                {p.price}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RazorpayConfigPanel;
