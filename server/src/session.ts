import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Pool } from 'pg';
import type { AppConfig } from './config.js';

/**
 * Session cookie. The value is an opaque id signed with SESSION_SECRET; the
 * session itself lives in PostgreSQL. `httpOnly` keeps it away from
 * document.cookie (and therefore from any XSS payload), and it is never
 * mirrored into localStorage by the frontend.
 */
export const SESSION_COOKIE_NAME = 'pdfpro.sid';

export function createSessionMiddleware(config: AppConfig, pool: Pool) {
  const PgStore = connectPgSimple(session);

  const store = new PgStore({
    pool: pool as never,
    tableName: 'user_sessions',
    // The table is created by our migration, not by the store.
    createTableIfMissing: false,
    pruneSessionInterval: 60 * 15,
  });

  return session({
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    // Slide the expiry forward on activity.
    rolling: true,
    // Behind nginx we must trust X-Forwarded-Proto for `secure` cookies.
    proxy: config.isProd,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: config.sessionTtlMs,
      path: '/',
    },
  });
}
