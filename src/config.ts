/**
 * Configuration switches and settings for the PDF Editor Pro application.
 *
 * ACCOUNTS_ENABLED: switches the optional account system on or off. The PDF
 * editor is always the landing page and is always usable — this flag never
 * installs a login wall. While it is enabled:
 *   - new visitors open as a guest (nobody is signed in automatically),
 *   - the header shows a "Login / Sign Up" button that links to /login,
 *   - signing in or signing up on /login returns the user to the editor,
 *   - only accounts whose role is 'admin' can open the Admin Dashboard.
 * Set it to false to hide accounts entirely and keep every visitor a guest.
 *
 * RAZORPAY: payment gateway configuration for subscription purchases.
 * These values are safe to expose on the client because the publishable
 * key (key_id) is designed to be public; the secret (key_secret) is only
 * ever used server-side and is provided here for the admin dashboard to
 * display and configure. In production, store the secret in an environment
 * variable / server-side configuration.
 */
export const ACCOUNTS_ENABLED = true;

export const RAZORPAY = {
  keyId: 'rzp_test_1_placeholder_key_id',
  keySecret: 'rzp_test_1_placeholder_key_secret',
  currency: 'INR', // Razorpay typically uses INR
} as const;

/** Available subscription plans (prices in USD). */
export const AVAILABLE_PLANS = ['pro-weekly', 'pro-monthly'] as const;
export type AvailablePlan = (typeof AVAILABLE_PLANS)[number];