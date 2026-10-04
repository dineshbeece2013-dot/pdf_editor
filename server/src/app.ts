import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import type { Pool } from 'pg';
import type { AppConfig } from './config.js';
import type { Database } from './db/index.js';
import { createSessionMiddleware } from './session.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { originGuard } from './middleware/originGuard.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { subscriptionRouter } from './routes/subscription.js';
import { paymentsRouter } from './routes/payments.js';
import { adminRouter } from './routes/admin.js';
import { razorpayRouter } from './routes/razorpay.js';

export interface AppDeps {
  config: AppConfig;
  db: Database;
  /** The raw pool is needed by the session store. */
  pool: Pool;
}

/**
 * Build the API. Kept separate from the listener so tests can mount the exact
 * same app against an in-memory database.
 */
export function createApp({ config, db, pool }: AppDeps): Express {
  const app = express();

  // Behind nginx, so X-Forwarded-Proto decides whether the cookie is `secure`.
  app.set('trust proxy', config.isProd);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '64kb' }));
  app.use(originGuard(config.appOrigin));

  // Session cookie -> httpOnly, sameSite=lax, secure in production.
  app.use(createSessionMiddleware(config, pool));
  // Resolve the signed-in user from the database for every request.
  app.use(attachUser(db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter(db));
  app.use('/api/me', meRouter(db));
  app.use('/api/subscription', subscriptionRouter(db, config));
  app.use('/api/payments', paymentsRouter(db));
  app.use('/api/razorpay', razorpayRouter(db, config));
  app.use('/api/admin', adminRouter(db));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
