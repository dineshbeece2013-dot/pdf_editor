import type { NextFunction, Request, Response } from 'express';
import type { Database } from '../db/index.js';
import { findById, type UserRow } from '../repositories/users.js';

/** The session only ever carries the user's id — never a token or a role. */
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Resolved from the session on every request by `attachUser`. */
    authUser?: UserRow;
  }
}

/**
 * Resolve the signed-in user for each request by looking the session's user id
 * up in the database. Looking it up per request (rather than trusting a role
 * baked into the cookie) is what makes a demoted or deleted admin lose access
 * immediately instead of at cookie expiry.
 */
export function attachUser(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.session?.userId;
      if (userId) {
        const row = await findById(db, userId);
        if (row) {
          req.authUser = row;
        } else {
          // The account was deleted while the cookie was still alive.
          req.session.userId = undefined;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
}
