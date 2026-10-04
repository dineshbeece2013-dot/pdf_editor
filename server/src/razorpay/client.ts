/**
 * Razorpay Orders API client.
 *
 * The order must exist in *Razorpay's* system, not just ours: when checkout
 * receives an `order_id` it fetches that order to learn the amount. Handing it
 * an id we invented makes the widget fail with "Something went wrong". Creating
 * it here also makes Razorpay, not the browser, the authority on how much was
 * charged.
 *
 * The key secret is used here and nowhere else on the request path.
 */

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export class RazorpayApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RazorpayApiError';
    this.status = status;
  }
}

export interface CreateOrderInput {
  keyId: string;
  keySecret: string;
  /** Smallest currency unit, e.g. paise. */
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export async function createRazorpayOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
  const authorization = 'Basic ' + Buffer.from(`${input.keyId}:${input.keySecret}`).toString('base64');

  let response: Response;
  try {
    response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        receipt: input.receipt,
        ...(input.notes ? { notes: input.notes } : {}),
      }),
    });
  } catch {
    throw new RazorpayApiError(0, 'Could not reach Razorpay. Check your connection and try again.');
  }

  const text = await response.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload?.error as { description?: string } | undefined;
    throw new RazorpayApiError(
      response.status,
      error?.description ?? `Razorpay returned HTTP ${response.status}.`,
    );
  }

  if (!payload || typeof payload.id !== 'string') {
    throw new RazorpayApiError(502, 'Razorpay did not return an order id.');
  }

  return {
    id: payload.id,
    amount: Number(payload.amount ?? input.amount),
    currency: String(payload.currency ?? input.currency),
  };
}