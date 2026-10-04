import { Router } from 'express';
import type { Database } from '../db/index.js';
import { evaluateEditAccess, recordEditForUser, toUserDto } from '../repositories/users.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

/**
 * Account-scoped endpoints for the signed-in user.
 *
 * The daily free-edit allowance is enforced here, not in the browser: the
 * client asks whether it may record an edit and the server decides.
 */
export function meRouter(db: Database): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/edit-access', (req, res) => {
    res.json({ access: evaluateEditAccess(req.authUser!) });
  });

  router.post('/edits', async (req, res, next) => {
    try {
      const user = req.authUser!;
      const before = evaluateEditAccess(user);
      if (!before.canEdit) {
        throw new HttpError(402, before.reason ?? 'You have used your free edit for today.');
      }
      const updated = await recordEditForUser(db, user);
      res.json({ user: toUserDto(updated), access: evaluateEditAccess(updated) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
