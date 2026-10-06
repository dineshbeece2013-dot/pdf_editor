/**
 * The complete database schema.
 *
 * Kept as a TypeScript template string rather than a .sql file so the compiled
 * `dist/` needs no asset copying, and so this stays the single source of truth.
 *
 * Portability notes: we deliberately avoid CITEXT, pgcrypto and triggers.
 *  - UUIDs are generated in the application (crypto.randomUUID).
 *  - Emails are normalised to lowercase in the application and enforced by a
 *    unique index on lower(email).
 *  - updated_at is written explicitly by UPDATE statements.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                       uuid PRIMARY KEY,
  name                     text NOT NULL,
  email                    text NOT NULL,
  -- Argon2id PHC string. Plaintext passwords are never stored or logged.
  password_hash            text NOT NULL,
  role                     text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  plan                     text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
  subscription_plan        text,
  subscription_expires_at  timestamptz,
  free_edits_used_today    integer NOT NULL DEFAULT 0,
  last_free_edit_date      date,
  total_edits              integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_plan_idx ON users (plan);

CREATE TABLE IF NOT EXISTS payments (
  id                    uuid PRIMARY KEY,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id               text NOT NULL,
  plan_name             text NOT NULL,
  -- Stored as numeric for money; read back with ::double precision so the API emits a JSON number.
  amount                numeric(12,2) NOT NULL,
  currency              text NOT NULL,
  provider              text NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay','demo')),
  status                text NOT NULL DEFAULT 'captured' CHECK (status IN ('created','captured','failed','refunded')),
  razorpay_order_id     text UNIQUE,
  razorpay_payment_id   text UNIQUE,
  razorpay_signature    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  captured_at           timestamptz
);

CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id);
CREATE INDEX IF NOT EXISTS payments_created_idx ON payments (created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);

-- Single-row table (id is pinned to 1 by a CHECK) holding the gateway config.
-- The secret is stored as AES-256-GCM ciphertext and never leaves the server.
CREATE TABLE IF NOT EXISTS razorpay_config (
  id             integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  key_id         text,
  key_secret_enc text,
  currency       text NOT NULL DEFAULT 'INR',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Editable plan catalogue. Seeded from DEFAULT_PLANS on boot; an admin can
-- change price, currency, period, name, description and visibility from the
-- dashboard. Checkout, grants and the public plans endpoint all read from
-- here, so the edited price is the price that is charged.
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  price         numeric(12,2) NOT NULL CHECK (price > 0),
  currency      text NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','USD')),
  duration_days integer NOT NULL CHECK (duration_days IN (1,7,30,90,365)),
  description   text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Session store used by connect-pg-simple.
-- The "sess" column is the serialised session object. It is text rather than
-- json so the parameter needs no implicit cast on the way in (the store hands
-- over a string); it JSON.parses whatever comes back.
CREATE TABLE IF NOT EXISTS user_sessions (
  sid     varchar NOT NULL PRIMARY KEY,
  sess    text NOT NULL,
  expire  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);
`;
