import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, RotateCcw } from 'lucide-react';
import { gatewayApi, type PublicGatewayConfig } from '../services/razorpay';
import { messageFor } from '../services/api';
import { SUBSCRIPTION_PLANS } from '../services/subscription';

const FIELDS: { key: 'keyId' | 'currency'; label: string; hint: string }[] = [
  { key: 'keyId', label: 'Key ID', hint: 'Publishable key — safe to expose (starts with rzp_)' },
  { key: 'currency', label: 'Currency', hint: 'e.g. INR or USD' },
];

const EMPTY: PublicGatewayConfig = { keyId: '', currency: 'USD', hasSecret: false, isConfigured: false };

/**
 * Admin editor for the Razorpay gateway keys.
 *
 * The secret is write-only. It is encrypted on the server and is never sent
 * back to the browser, so this panel can only report whether one is set —
 * leaving the field blank keeps the stored value unchanged.
 */
export const RazorpayConfigPanel: React.FC = () => {
  const [config, setConfig] = useState<PublicGatewayConfig>(EMPTY);
  const [secretInput, setSecretInput] = useState('');
  const [revealSecret, setRevealSecret] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void gatewayApi
      .get()
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch((err) => {
        if (!cancelled) setError(messageFor(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (key: 'keyId' | 'currency', value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      const savedConfig = await gatewayApi.save({
        keyId: config.keyId,
        currency: config.currency,
        ...(secretInput.trim() ? { keySecret: secretInput.trim() } : {}),
      });
      setConfig(savedConfig);
      setSecretInput('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setSecretInput('');
    setError('');
    setSaved(false);
    void gatewayApi
      .get()
      .then(setConfig)
      .catch((err) => setError(messageFor(err)));
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-neutral-200 rounded-lg shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-emerald-600" />
          <h2 className="text-xl font-bold text-neutral-800">Razorpay Configuration</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Keys used by the Pro checkout. The secret is stored encrypted on the server and is never sent
          back to this page.
        </p>

        {!config.isConfigured && (
          <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              No keys configured yet. Add your Razorpay <b>test</b> keys to accept real sandbox payments.
            </span>
          </div>
        )}

        {error && (
          <div className="px-3 py-2.5 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-neutral-700 mb-1">{f.label}</label>
              <input
                type="text"
                value={config[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.label}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:border-emerald-500 focus:outline-none font-mono"
              />
              <p className="text-[11px] text-neutral-400 mt-1">{f.hint}</p>
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Key Secret</label>
            <div className="flex items-center gap-2">
              <input
                type={revealSecret ? 'text' : 'password'}
                value={secretInput}
                onChange={(e) => {
                  setSecretInput(e.target.value);
                  setSaved(false);
                }}
                placeholder={config.hasSecret ? '•••••••• stored — leave blank to keep' : 'Enter the key secret'}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-md focus:border-emerald-500 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setRevealSecret((v) => !v)}
                title={revealSecret ? 'Hide' : 'Reveal'}
                className="p-2 rounded-md border border-neutral-200 text-neutral-500 hover:text-emerald-600 hover:bg-emerald-50"
              >
                {revealSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1">
              {config.hasSecret
                ? 'A secret is stored. It cannot be displayed — clear this field and save to replace it.'
                : 'Used server-side only for signature verification. Stored encrypted; never returned.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={() => void handleSave()}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold"
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
                {String(p.currency) === 'INR' ? '₹' : '$'}
                {p.price}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400 mt-3">
          Prices are defined by the server and cannot be changed from the browser.
        </p>
      </div>
    </div>
  );
};

export default RazorpayConfigPanel;