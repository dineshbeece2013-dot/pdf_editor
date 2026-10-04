// Razorpay Standard Checkout integration.
//
// The publishable `keyId` is shipped to the browser (that is by design); the
// `keySecret` is NEVER used client-side for a real charge — it lives here only
// so the admin dashboard can store/display it. A production build must create
// the order (and verify the signature) on a server, then hand the browser the
// `order_id`. This demo opens checkout directly with key + amount.

import { RAZORPAY } from '../config';
import { SUBSCRIPTION_PLANS, type PlanId } from './subscription';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  currency: string;
}

const CONFIG_KEY = 'pdfpro.razorpay';

/** Effective Razorpay config: admin override (localStorage) or config.ts default. */
export function getRazorpayConfig(): RazorpayConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RazorpayConfig>;
      return {
        keyId: parsed.keyId ?? RAZORPAY.keyId,
        keySecret: parsed.keySecret ?? RAZORPAY.keySecret,
        currency: parsed.currency ?? RAZORPAY.currency,
      };
    }
  } catch {
    /* ignore */
  }
  return { keyId: RAZORPAY.keyId, keySecret: RAZORPAY.keySecret, currency: RAZORPAY.currency };
}

export function saveRazorpayConfig(patch: Partial<RazorpayConfig>): RazorpayConfig {
  const next = { ...getRazorpayConfig(), ...patch };
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** True when the configured key is still the placeholder shipped in config.ts. */
export function isPlaceholderKey(): boolean {
  return getRazorpayConfig().keyId === RAZORPAY.keyId;
}

declare global {
  interface Window {
    // Razorpay injects this global; it is untyped upstream.
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: RazorpayFailureResponse) => void) => void;
    };
  }
}

interface RazorpayFailureResponse {
  error?: { description?: string; reason?: string };
}

/** Inject the Razorpay checkout script once; resolves true when usable. */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.setAttribute('data-razorpay', 'true');
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export interface CheckoutResult {
  success: boolean;
  paymentId?: string;
  error?: string;
}

export interface CheckoutOptions {
  planId: PlanId;
  userName: string;
  userEmail: string;
}

/**
 * Open the Razorpay checkout for a plan and resolve once the user pays,
 * dismisses, or the payment fails.
 */
export async function startRazorpayCheckout(opts: CheckoutOptions): Promise<CheckoutResult> {
  const plan = SUBSCRIPTION_PLANS[opts.planId];
  const config = getRazorpayConfig();
  const amount = Math.round(plan.price * 100); // smallest currency unit

  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    return { success: false, error: 'Could not reach Razorpay. Check your connection and try again.' };
  }

  return new Promise<CheckoutResult>((resolve) => {
    const RazorpayCtor = window.Razorpay;
    if (!RazorpayCtor) {
      resolve({ success: false, error: 'Razorpay is unavailable.' });
      return;
    }

    const instance = new RazorpayCtor({
      key: config.keyId,
      amount,
      currency: config.currency,
      name: 'PDF Editor Pro',
      description: plan.description,
      prefill: { name: opts.userName, email: opts.userEmail },
      notes: { planId: opts.planId },
      theme: { color: '#059669' },
      handler: (response: { razorpay_payment_id?: string }) => {
        resolve({
          success: true,
          paymentId: response?.razorpay_payment_id || 'pay_' + Date.now(),
        });
      },
      modal: {
        ondismiss: () => resolve({ success: false, error: 'Checkout closed before payment.' }),
      },
    });

    instance.on('payment.failed', (response) => {
      resolve({
        success: false,
        error: response?.error?.description || 'Payment failed. Please try again.',
      });
    });

    instance.open();
  });
}
