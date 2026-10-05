import type { NextFunction, Request, Response } from 'express';

/**
 * CSRF defence for cookie-authenticated mutations.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site POSTs in
 * modern browsers. This adds a second, explicit layer: a state-changing request
 * must not arrive from another origin. `Sec-Fetch-Site` is preferred when the
 * browser sends it, falling back to the `Origin` header.
 *
 * Safe methods are untouched so the GET API stays usable.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Accepts one origin or several. Origins are compared case-insensitively and
 * must match exactly (scheme + host + port) — no wildcards, because a
 * wildcard would reintroduce the cross-site risk this guard exists to stop.
 */
export function originGuard(appOrigins: string | string[]) {
  const allowed = new Set(
    (Array.isArray(appOrigins) ? appOrigins : [appOrigins]).map((o) => o.trim().toLowerCase()),
  );

  return function guard(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const fetchSite = req.get('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
      res.status(403).json({ error: 'Cross-origin request blocked.' });
      return;
    }

    // The browser sends `Origin`, so normalise its scheme/host case the same
    // way as the configured list. Host is case-insensitive per RFC 3986;
    // scheme and port are not, so they still have to match exactly.
    const origin = req.get('origin')?.trim().toLowerCase();
    if (origin && !allowed.has(origin)) {
      res.status(403).json({ error: 'Cross-origin request blocked.' });
      return;
    }

    next();
  };
}
