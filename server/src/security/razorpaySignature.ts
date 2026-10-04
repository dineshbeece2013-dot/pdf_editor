import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay checkout signature verification.
 *
 * Razorpay returns `razorpay_signature` = HMAC_SHA256("<order_id>|<payment_id>",
 * key_secret). Only the server holds the secret, so verifying it server-side is
 * what proves the payment was genuinely made for an order we created — the
 * browser cannot forge one.
 */

export function computeRazorpaySignature(orderId: string, paymentId: string, keySecret: string): string {
  return createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
}

/** Constant-time comparison; returns false for missing/garbage signatures. */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: unknown,
  keySecret: string,
): boolean {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const expected = Buffer.from(computeRazorpaySignature(orderId, paymentId, keySecret), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

/** Deterministic, collision-resistant id for the payment row we create up front. */
export function makeOrderReference(): string {
  return `order_${randomBytes(12).toString('hex')}`;
}
