import { Router } from 'express';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/index.js';
import { createUser, findByEmail, toUserDto, updatePasswordHash } from '../repositories/users.js';
import {
  burnVerificationTime,
  hashPassword,
  PASSWORD_MIN_LENGTH,
  validatePassword,
  verifyPassword,
} from '../security/password.js';
import { HttpError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { SESSION_COOKIE_NAME } from '../session.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Start a fresh session for a user id. Regenerating on privilege change (login,
 * registration, password change) prevents session fixation.
 */
function startSession(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenErr) => {
      if (regenErr) return reject(regenErr);
      req.session.userId = userId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

export function authRouter(db: Database): Router {
  const router = Router();

  router.post(
    '/register',
    rateLimit({ windowMs: 60 * 60_000, max: 10, bucket: 'register', message: 'Too many sign-ups from this address. Try again later.' }),
    async (req, res, next) => {
      try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;

        if (name.length < 2) throw new HttpError(400, 'Please enter your name.');
        if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');

        const passwordProblem = validatePassword(password);
        if (passwordProblem) throw new HttpError(400, passwordProblem);

        if (await findByEmail(db, email)) {
          throw new HttpError(409, 'An account with this email already exists.');
        }

        const passwordHash = await hashPassword(password);
        // The role is hardcoded here. Registration has no code path that can
        // read a role from the request, so a normal user cannot self-promote.
        const user = await createUser(db, {
          id: randomUUID(),
          name,
          email,
          passwordHash,
          role: 'user',
        });

        await startSession(req, user.id);
        res.status(201).json({ user: toUserDto(user) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/login',
    rateLimit({ windowMs: 15 * 60_000, max: 10, bucket: 'login', message: 'Too many sign-in attempts. Please wait and try again.' }),
    async (req, res, next) => {
      try {
        const email = normalizeEmail(req.body?.email);
        const password = typeof req.body?.password === 'string' ? req.body.password : '';

        const row = await findByEmail(db, email);
        if (!row) {
          // Spend comparable CPU so a missing account is not distinguishable
          // from a wrong password by response time.
          await burnVerificationTime(password);
          throw new HttpError(401, 'Invalid email or password.');
        }

        const ok = await verifyPassword(row.password_hash, password);
        if (!ok) throw new HttpError(401, 'Invalid email or password.');

        await startSession(req, row.id);
        res.json({ user: toUserDto(row) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.json({ ok: true });
    });
  });

  /**
   * Returns 200 with `user: null` for a guest rather than a 401, so the client
   * can tell "signed out" apart from "backend unreachable".
   */
  router.get('/me', (req, res) => {
    res.json({
      user: req.authUser ? toUserDto(req.authUser) : null,
      passwordPolicy: { minLength: PASSWORD_MIN_LENGTH },
    });
  });

  router.post(
    '/password',
    requireAuth,
    rateLimit({ windowMs: 15 * 60_000, max: 5, bucket: 'password', message: 'Too many attempts. Please wait and try again.' }),
    async (req, res, next) => {
      try {
        const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
        const newPassword = req.body?.newPassword;

        const problem = validatePassword(newPassword);
        if (problem) throw new HttpError(400, problem);

        const user = req.authUser!;
        if (!(await verifyPassword(user.password_hash, currentPassword))) {
          throw new HttpError(401, 'Current password is incorrect.');
        }

        await updatePasswordHash(db, user.id, await hashPassword(newPassword));
        // Re-issue the session so the old id stops being usable.
        await startSession(req, user.id);

        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
