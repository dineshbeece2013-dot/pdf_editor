import { api } from './api';
import type { PlanSummary } from './subscription';
import type { AppUser } from './localAuth';

/**
 * Razorpay checkout + gateway configuration.
 *
 * Two rules hold throughout:
 *  1. The browser never sees the key secret. It only ever receives the
 *     publishable key id, and `PublicGatewayConfig` has no field for a secret.
 *  2. The browser never decides an amount. It asks the server for an order and
 *     opens the checkout with the amount the server priced; access is granted
 *     only when the server independently verifies Razorpay's signature.
 */

export interface PublicGatewayConfig {
  keyId: string;
  currency: string;
  /** Tells the admin UI a secret exists without revealing it. */
  hasSecret: boolean;
  isConfigured: boolean;
}

export const gatewayApi = {
  get: () => api.get<PublicGatewayConfig>('/razorpay/config'),
  /** The secret is write-only: send it once to set or replace it. */
  save: (patch: { keyId?: string; keySecret?: string; currency?: string }) =>
    api.put<PublicGatewayConfig>('/razorpay/config', patch),
};

export interface CreatedOrder {
  orderId: string;
  keyId: string;
  /** Smallest currency unit, as Razorpay expects. */
  amount: number;
  currency: string;
  planId: string;
  planName: string;
  description: string;
}

/** The triple Razorpay returns, which the server will verify. */
export interface PaymentProof {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export const subscriptionApi = {
  /**
   * The server's own catalogue, with the gateway config alongside it.
   *
   * The returned `plans` are authoritative: the UI shows these prices rather
   * than a bundled copy, so what a customer reads is what they are charged.
   */
  plans: () =>
    api.get<{ plans: PlanSummary[]; gateway: PublicGatewayConfig }>('/subscription/plans'),
  createOrder: (planId: string) => api.post<CreatedOrder>('/subscription/order', { planId }),
  verify: (proof: PaymentProof) =>
    api.post<{ user: AppUser | null; replay: boolean }>('/subscription/verify', proof),
  /** Sandbox shortcut; the server refuses it when disabled. */
  demo: (planId: string) => api.post<{ user: AppUser | null; demo: boolean }>('/subscription/demo', { planId }),
  cancel: () => api.post<{ user: AppUser | null }>('/subscription/cancel'),
};

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
  /** Present only on success; hand it straight to subscriptionApi.verify. */
  payment?: PaymentProof;
  error?: string;
}

/**
 * Open the Razorpay checkout for an order the server already created, and
 * resolve once the user pays, dismisses, or the payment fails.
 */
export async function startRazorpayCheckout(opts: {
  order: CreatedOrder;
  userName: string;
  userEmail: string;
}): Promise<CheckoutResult> {
  const { order } = opts;

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
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'PDF Editor Pro',
      description: order.description,
      prefill: { name: opts.userName, email: opts.userEmail },
      theme: { color: '#059669' },
      handler: (response: {
        razorpay_payment_id?: string;
        razorpay_order_id?: string;
        razorpay_signature?: string;
      }) => {
        const paymentId = response?.razorpay_payment_id;
        const orderId = response?.razorpay_order_id;
        const signature = response?.razorpay_signature;
        if (!paymentId || !orderId || !signature) {
          resolve({ success: false, error: 'The payment response was incomplete.' });
          return;
        }
        resolve({
          success: true,
          payment: {
            razorpay_payment_id: paymentId,
            razorpay_order_id: orderId,
            razorpay_signature: signature,
          },
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