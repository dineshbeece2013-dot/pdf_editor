import { Router } from 'express';
import type { Database } from '../db/index.js';
import { listForUser } from '../repositories/payments.js';
import { requireAuth } from '../middleware/auth.js';

/** The signed-in user's own payment history. Admin-wide history lives in /admin. */
export function paymentsRouter(db: Database): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      res.json({ payments: await listForUser(db, req.authUser!.id) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
