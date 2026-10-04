import { api } from './api';

/**
 * Payment ledger API client.
 *
 * Replaces the old localStorage ledger. Rows are written by the backend when
 * it creates an order and again when it verifies Razorpay's signature, so the
 * amounts shown here are the ones the server priced — not anything the browser
 * claimed. The `PaymentRecord` shape is unchanged so the admin table renders
 * exactly as before.
 */

export type PaymentStatus = 'created' | 'captured' | 'failed' | 'refunded';
export type PaymentMethod = 'razorpay' | 'demo';

export interface PaymentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  /** Razorpay payment id, falling back to the order id until it is captured. */
  razorpayPaymentId: string;
  status: PaymentStatus;
  /** Where the payment came from — real checkout or the sandbox shortcut. */
  method: PaymentMethod;
  createdAt: number;
}

export const paymentsApi = {
  /** The signed-in user's own history. */
  mine: () => api.get<{ payments: PaymentRecord[] }>('/payments'),

  /** Every payment plus revenue grouped by currency. Admin only. */
  all: () => api.get<{ payments: PaymentRecord[]; revenue: Record<string, number> }>('/admin/payments'),

  /** Empty the ledger. Admin only. */
  clear: () => api.delete<{ ok: true }>('/admin/payments'),
};