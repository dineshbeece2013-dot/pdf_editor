/**
 * Configuration switches and settings for the PDF Editor Pro application.
 *
 * AUTH_ENABLED: while false, the editor opens straight away as the default
 * landing page with a built-in session (the seeded admin), so users can start
 * editing immediately — no login wall. Flip it to `true` to gate the app behind
 * the login page and require sign-in before editing.
 *
 * RAZORPAY: payment gateway configuration for subscription purchases.
 * These values are safe to expose on the client because the publishable
 * key (key_id) is designed to be public; the secret (key_secret) is only
 * ever used server-side and is provided here for the admin dashboard to
 * display and configure. In production, store the secret in an environment
 * variable / server-side configuration.
 */
export const AUTH_ENABLED = false;

export const RAZORPAY = {
  keyId: 'rzp_test_1_placeholder_key_id',
  keySecret: 'rzp_test_1_placeholder_key_secret',
  currency: 'INR', // Razorpay typically uses INR
} as const;

/** Available subscription plans (prices in USD). */
export const AVAILABLE_PLANS = ['pro-weekly', 'pro-monthly'] as const;
export type AvailablePlan = (typeof AVAILABLE_PLANS)[number];