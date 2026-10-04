import { Router } from 'express';
import type { Database } from '../db/index.js';
import type { AppConfig } from '../config.js';
import { loadGatewayConfig, saveGatewayConfig, toPublicGatewayConfig } from '../repositories/razorpayConfig.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

const CURRENCY_RE = /^[A-Za-z]{3}$/;

/**
 * Gateway configuration.
 *
 * GET is public because the checkout widget needs the publishable key id, but
 * the response shape has no field for the secret — `toPublicGatewayConfig`
 * reduces the stored config to keyId + currency + hasSecret. PUT is admin-only
 * and the secret is write-only: it is encrypted on the way in and can never be
 * read back.
 */
export function razorpayRouter(db: Database, config: AppConfig): Router {
  const router = Router();

  router.get('/config', async (_req, res, next) => {
    try {
      res.json(toPublicGatewayConfig(await loadGatewayConfig(db, config)));
    } catch (err) {
      next(err);
    }
  });

  router.put('/config', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      if (body.keyId !== undefined) {
        const keyId = String(body.keyId).trim();
        if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
          throw new HttpError(400, 'Key ID must look like rzp_test_... or rzp_live_...');
        }
      }
      if (body.currency !== undefined && !CURRENCY_RE.test(String(body.currency).trim())) {
        throw new HttpError(400, 'Currency must be a 3-letter code such as INR or USD.');
      }
      if (body.keySecret !== undefined && String(body.keySecret).length > 200) {
        throw new HttpError(400, 'Key secret is unreasonably long.');
      }

      await saveGatewayConfig(db, config, {
        keyId: body.keyId === undefined ? undefined : String(body.keyId),
        keySecret: body.keySecret === undefined ? undefined : String(body.keySecret),
        currency: body.currency === undefined ? undefined : String(body.currency),
      });

      res.json(toPublicGatewayConfig(await loadGatewayConfig(db, config)));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
