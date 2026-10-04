import type { NextFunction, Request, Response } from 'express';

/**
 * Small fixed-window, in-memory rate limiter.
 *
 * Deliberately dependency-free. It is per-process, so a multi-instance
 * deployment needs Redis (or a gateway-level limiter) to make it global —
 * documented in the README rather than silently pretended to be robust.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Distinguishes independent buckets (e.g. 'login' vs 'register'). */
  bucket: string;
  message?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, bucket, message = 'Too many attempts. Please wait and try again.' } = options;
  const buckets = new Map<string, Bucket>();

  // Keep the map from growing without bound in a long-running process.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key);
    }
  }, windowMs).unref?.();

  return function limiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = `${bucket}:${req.ip ?? 'unknown'}`;
    const entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
  // `sweeper` is referenced only to keep the interval alive; nothing to export.
  void sweeper;
}
