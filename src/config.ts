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
 * GATEWAY KEYS: Razorpay credentials are no longer part of the frontend at
 * all. The key secret lives encrypted in PostgreSQL and is only ever read by
 * the backend; the browser gets a publishable key id from
 * GET /api/razorpay/config. Never add a secret to this file — anything here
 * ships to every visitor in the JavaScript bundle.
 */
export const ACCOUNTS_ENABLED = true;

/** Available subscription plans (mirror of the server's catalogue, display only). */
export const AVAILABLE_PLANS = ['pro-weekly', 'pro-monthly'] as const;
export type AvailablePlan = (typeof AVAILABLE_PLANS)[number];