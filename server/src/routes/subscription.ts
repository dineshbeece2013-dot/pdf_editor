import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/index.js';
import type { AppConfig } from '../config.js';
import { getPlan, listPlans } from '../plans.js';
import { loadGatewayConfig, toPublicGatewayConfig } from '../repositories/razorpayConfig.js';
import {
  createPendingOrder,
  findByPaymentId,
  findOrderForUser,
  markCaptured,
  markFailed,
} from '../repositories/payments.js';
import { activateSubscription, cancelSubscription, findById, toUserDto } from '../repositories/users.js';
import { makeOrderReference, verifyRazorpaySignature } from '../security/razorpaySignature.js';
import { createRazorpayOrder, RazorpayApiError } from '../razorpay/client.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';

/**
 * Subscription purchase flow.
 *
 * The browser never decides what a plan costs or whether it was paid. It asks
 * for an order, the server prices it from its own catalogue and records the
 * order, and access is granted only after the server has independently
 * verified Razorpay's signature over that exact order.
 */
export function subscriptionRouter(db: Database, config: AppConfig): Router {
  const router = Router();

  router.get('/plans', async (_req, res, next) => {
    try {
      const gateway = await loadGatewayConfig(db, config);
      res.json({ plans: listPlans(), gateway: toPublicGatewayConfig(gateway) });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/order',
    requireAuth,
    rateLimit({ windowMs: 10 * 60_000, max: 20, bucket: 'order' }),
    async (req, res, next) => {
      try {
        const plan = getPlan(req.body?.planId);
        if (!plan) throw new HttpError(400, 'Unknown plan.');

        const gateway = await loadGatewayConfig(db, config);
        if (!gateway.keyId || !gateway.keySecret) {
          throw new HttpError(503, 'Payments are not configured yet.');
        }

        // The charge is denominated in the gateway currency. Refuse a
        // mismatch rather than silently charging "₹3" for a plan advertised
        // as "$3 / month".
        if (plan.currency !== gateway.currency) {
          throw new HttpError(
            400,
            `This plan is priced in ${plan.currency} but the gateway is set to ${gateway.currency}. ` +
              'Set a matching currency in the admin dashboard (Razorpay) or change the plan price.',
          );
        }

        const amount = Math.round(plan.price * 100);

        // The order has to exist in Razorpay's own system: checkout looks it
        // up by id to determine the amount, and rejects ids it has not seen.
        let razorpayOrder;
        try {
          razorpayOrder = await createRazorpayOrder({
            keyId: gateway.keyId,
            keySecret: gateway.keySecret,
            amount,
            currency: gateway.currency,
            receipt: makeOrderReference(),
            notes: { planId: plan.id },
          });
        } catch (err) {
          const detail = err instanceof RazorpayApiError ? err.message : 'Could not reach Razorpay.';
          throw new HttpError(502, detail);
        }

        // Our row records the *real* Razorpay order id, which is also what the
        // signature is computed over, so verification stays a simple lookup.
        await createPendingOrder(db, {
          id: randomUUID(),
          userId: req.authUser!.id,
          planId: plan.id,
          planName: plan.name,
          amount: plan.price,
          currency: gateway.currency,
          provider: 'razorpay',
          orderId: razorpayOrder.id,
        });

        res.status(201).json({
          orderId: razorpayOrder.id,
          keyId: gateway.keyId,
          // Echo Razorpay's own figures rather than ours.
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          planId: plan.id,
          planName: plan.name,
          description: plan.description,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/verify', requireAuth, async (req, res, next) => {
    try {
      const user = req.authUser!;
      const orderId = typeof req.body?.razorpay_order_id === 'string' ? req.body.razorpay_order_id : '';
      const paymentId = typeof req.body?.razorpay_payment_id === 'string' ? req.body.razorpay_payment_id : '';
      const signature = req.body?.razorpay_signature;
      if (!orderId || !paymentId) throw new HttpError(400, 'Missing payment details.');

      const outcome = await db.transaction(async (tx) => {
        // Scoped to the signed-in user: an order id alone proves nothing.
        const order = await findOrderForUser(tx, orderId, user.id);
        if (!order) throw new HttpError(404, 'Unknown order.');
        if (order.status === 'captured') {
          // Replay of an already-verified payment — idempotent success.
          return { user: await findById(tx, user.id), replay: true };
        }

        const reused = await findByPaymentId(tx, paymentId);
        if (reused && reused.razorpay_order_id !== orderId) {
          throw new HttpError(409, 'That payment has already been applied to another order.');
        }

        const gateway = await loadGatewayConfig(tx, config);
        if (!gateway.keySecret) throw new HttpError(503, 'Payments are not configured yet.');

        if (!verifyRazorpaySignature(orderId, paymentId, signature, gateway.keySecret)) {
          await markFailed(tx, orderId);
          throw new HttpError(400, 'Payment could not be verified.');
        }

        await markCaptured(tx, orderId, paymentId, typeof signature === 'string' ? signature : null);
        // The plan id comes from the stored order, so a tampered client request
        // cannot upgrade someone to a longer plan than they paid for.
        const updated = await activateSubscription(tx, user.id, order.plan_id);
        return { user: updated, replay: false };
      });

      res.json({ user: outcome.user ? toUserDto(outcome.user) : null, replay: outcome.replay });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Sandbox escape hatch so the upgrade flow is testable without live keys.
   * It grants access server-side, and the route is hard-disabled in production
   * by `allowDemoPayments` — see config.ts.
   */
  router.post('/demo', requireAuth, async (req, res, next) => {
    try {
      if (!config.allowDemoPayments) {
        throw new HttpError(403, 'Demo payments are disabled on this server.');
      }
      const plan = getPlan(req.body?.planId);
      if (!plan) throw new HttpError(400, 'Unknown plan.');

      const user = req.authUser!;
      const updated = await db.transaction(async (tx) => {
        await createPendingOrder(tx, {
          id: randomUUID(),
          userId: user.id,
          planId: plan.id,
          planName: plan.name,
          amount: plan.price,
          currency: plan.currency,
          provider: 'demo',
          status: 'captured',
          orderId: `demo_${randomUUID()}`,
        });
        return activateSubscription(tx, user.id, plan.id);
      });

      res.json({ user: updated ? toUserDto(updated) : null, demo: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/cancel', requireAuth, async (req, res, next) => {
    try {
      const user = req.authUser!;
      if (user.role === 'admin') {
        throw new HttpError(400, 'Administrator accounts do not have a subscription to cancel.');
      }
      const updated = await cancelSubscription(db, user.id);
      res.json({ user: updated ? toUserDto(updated) : null });
    } catch (err) {
      next(err);
    }
  });


  return router;
}
