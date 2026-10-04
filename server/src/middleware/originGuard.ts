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

export function originGuard(appOrigin: string) {
  const allowed = new Set([appOrigin]);

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

    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      res.status(403).json({ error: 'Cross-origin request blocked.' });
      return;
    }

    next();
  };
}
