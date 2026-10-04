import { Router } from 'express';
import type { Database } from '../db/index.js';
import {
  activateSubscription,
  cancelSubscription,
  countAdmins,
  deleteUser,
  findById,
  listUsers,
  toUserDto,
  updateUser,
  validateAdminPatch,
} from '../repositories/users.js';
import { clearAll, listAll, revenueByCurrency } from '../repositories/payments.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

/**
 * Administrator API.
 *
 * Every route is gated by `requireAuth` + `requireAdmin`, which read the role
 * from the database row resolved for this request. The client's view of the
 * user (and any `role` field it sends) is never consulted, so tampering with
 * the page cannot widen access.
 *
 * The route also refuses to remove the last administrator, which would
 * otherwise lock everyone out of this panel permanently.
 */
export function adminRouter(db: Database): Router {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  router.get('/users', async (_req, res, next) => {
    try {
      const rows = await listUsers(db);
      res.json({ users: rows.map(toUserDto) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id', async (req, res, next) => {
    try {
      const actor = req.authUser!;
      const targetId = String(req.params.id);
      const patch = (req.body ?? {}) as Record<string, unknown>;

      const validation = validateAdminPatch(patch);
      if (!validation.ok) throw new HttpError(400, validation.error!);

      const target = await findById(db, targetId);
      if (!target) throw new HttpError(404, 'User not found.');

      if (patch.role === 'user') {
        if (targetId === actor.id) throw new HttpError(400, 'You cannot demote yourself.');
        if (target.role === 'admin' && (await countAdmins(db)) <= 1) {
          throw new HttpError(400, 'At least one administrator must remain.');
        }
      }

      const updated = await updateUser(db, targetId, patch);
      if (!updated) throw new HttpError(404, 'User not found.');
      res.json({ user: toUserDto(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/users/:id', async (req, res, next) => {
    try {
      const targetId = String(req.params.id);
      if (targetId === req.authUser!.id) {
        throw new HttpError(400, 'You cannot delete your own account from here.');
      }
      const target = await findById(db, targetId);
      if (!target) throw new HttpError(404, 'User not found.');
      if (target.role === 'admin' && (await countAdmins(db)) <= 1) {
        throw new HttpError(400, 'At least one administrator must remain.');
      }
      await deleteUser(db, targetId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:id/reset-edits', async (req, res, next) => {
    try {
      const updated = await updateUser(db, String(req.params.id), {
        freeEditsUsedToday: 0,
        lastFreeEditDate: null,
      });
      if (!updated) throw new HttpError(404, 'User not found.');
      res.json({ user: toUserDto(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:id/grant', async (req, res, next) => {
    try {
      const targetId = String(req.params.id);
      if (!(await findById(db, targetId))) throw new HttpError(404, 'User not found.');
      // The plan is validated against the server catalogue by activateSubscription.
      const updated = await activateSubscription(db, targetId, req.body?.planId);
      if (!updated) throw new HttpError(404, 'User not found.');
      res.json({ user: toUserDto(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:id/cancel', async (req, res, next) => {
    try {
      const updated = await cancelSubscription(db, String(req.params.id));
      if (!updated) throw new HttpError(404, 'User not found.');
      res.json({ user: toUserDto(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/payments', async (_req, res, next) => {
    try {
      const [payments, revenue] = await Promise.all([listAll(db), revenueByCurrency(db)]);
      res.json({ payments, revenue });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/payments', async (_req, res, next) => {
    try {
      await clearAll(db);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
