# PDF Editor Pro — API server

Express + PostgreSQL backend. This is where authentication, subscriptions,
payments and admin permissions are actually enforced. The frontend is a static
site; everything security-sensitive happens here.

## Stack

| Concern | Choice |
|---|---|
| HTTP | Express 5 |
| Database | PostgreSQL 16 (`pg`) |
| Password hashing | Argon2id (`argon2`), OWASP parameters (19 MiB, t=2, p=1) |
| Sessions | `express-session` + `connect-pg-simple`, opaque id in an httpOnly cookie |
| Gateway | Razorpay — orders priced server-side, HMAC-SHA256 signatures verified server-side |

## Local setup

```bash
# 1. Start PostgreSQL (creates an empty `pdfpro` database)
docker compose up -d

# 2. Configure
cd server
cp .env.example .env
# Generate the two secrets the .env file asks for:
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('RAZORPAY_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
# Paste both into .env, and set ADMIN_PASSWORD to something strong.

# 3. Install
npm install

# 4. Create the first administrator (safe to re-run)
npm run seed:admin

# 5. Run (schema is created automatically on boot)
npm run dev
```

Then start the frontend in a second terminal:

```bash
npm run dev     # http://localhost:5173 — Vite proxies /api to :4000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Watch mode on `:4000` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run migrate` | Apply the schema (also runs automatically on boot) |
| `npm run seed:admin` | Create the bootstrap administrator |
| `npm test` | Integration suite (runs against an in-memory PostgreSQL) |
| `npm run typecheck` | `tsc --noEmit` |

## API

All routes are prefixed `/api`. Mutating requests are rejected if `Origin` or
`Sec-Fetch-Site` indicates another site.

### Auth
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | — | Always creates `role: 'user'`. Returns the user; sets the session cookie. |
| POST | `/auth/login` | — | Argon2id verification. Regenerates the session. |
| POST | `/auth/logout` | — | Destroys the session and clears the cookie. |
| GET | `/auth/me` | optional | `{ user: null }` for a guest (200, not 401). |
| POST | `/auth/password` | user | Requires the current password; re-issues the session. |

### Account
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/me/edit-access` | user | Server's verdict on the daily edit allowance. |
| POST | `/me/edits` | user | Records an edit. `402` once the allowance is spent. |

### Subscription
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/subscription/plans` | — | Catalogue + public gateway config. |
| POST | `/subscription/order` | user | Prices the plan **server-side** and records the order. |
| POST | `/subscription/verify` | user | Verifies Razorpay's signature, then activates. Idempotent. |
| POST | `/subscription/demo` | user | Sandbox shortcut. Refused when `ALLOW_DEMO_PAYMENTS` is off — always off in production. |
| POST | `/subscription/cancel` | user | Returns the account to the free tier. |

### Payments
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/payments` | user | The caller's own history. |
| GET | `/admin/payments` | admin | Everything, plus revenue by currency. |
| DELETE | `/admin/payments` | admin | Empties the ledger. |

### Admin
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/users` | All accounts (no password hashes). |
| PATCH | `/admin/users/:id` | Allowlisted fields only. Unknown keys are rejected. |
| DELETE | `/admin/users/:id` | Cannot delete yourself, nor the last admin. |
| POST | `/admin/users/:id/reset-edits` | Clears today's counter. |
| POST | `/admin/users/:id/grant` | Activates a plan; expiry computed server-side. |
| POST | `/admin/users/:id/cancel` | Revokes a subscription. |

### Gateway config
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/razorpay/config` | — | `keyId`, `currency`, `hasSecret`, `isConfigured`. **Never the secret.** |
| PUT | `/razorpay/config` | admin | The secret is write-only: send it to set/replace, leave blank to keep. |
## Security notes

**Passwords.** Hash-only, Argon2id. No endpoint accepts or returns a password
after registration. Login runs a decoy hash when the email is unknown so
response timing does not reveal which addresses are registered.

**Sessions.** The cookie is `httpOnly` (JavaScript cannot read it, so an XSS
payload cannot exfiltrate it), `sameSite=lax`, `secure` in production, and the
session body lives in PostgreSQL. Nothing is written to `localStorage`.

**Roles.** Read from the database on every request by `attachUser`, so a
demoted or deleted admin loses access immediately. Registration hardcodes
`role: 'user'`; the only way to create an admin is `seed-admin.ts` on the
server. A user cannot send a `role` field at signup, and the admin API
rejects any patch outside its allowlist.

**Payments.** The browser never sends an amount. It asks for an order, the
server prices it from its own catalogue, and access is granted only after the
server verifies Razorpay's HMAC-SHA256 signature over *that* order. Orders are
scoped to the signed-in user, so one account cannot confirm another's, and
verification is idempotent so a retry cannot double-apply.

**Gateway secret.** Stored as AES-256-GCM ciphertext (`RAZORPAY_ENCRYPTION_KEY`).
`toPublicGatewayConfig` is the only shape that leaves the server, and it has no
field for the secret. The admin UI shows a "a secret is set" flag instead.

## Deployment

Build, then run under systemd with a real `.env`:

```bash
npm ci --omit=dev && npm run build
NODE_ENV=production node dist/index.js
```

`deploy/nginx.conf` already proxies `/api/` to `127.0.0.1:4000` and forwards
`X-Forwarded-Proto`, which the app needs to set `secure` cookies.

## Known limitations

- **Rate limiting is per-process and in-memory.** Multiple instances each get
  their own counters; use Redis or a gateway-level limiter to make it global.
- **No email.** No verification or password-reset flow.
- **No Razorpay webhook.** A payment that succeeds in Razorpay but whose
  `verify` call is lost stays unpaid. Add a webhook endpoint before going live.
- **`rejectUnauthorized: false`** when `DATABASE_SSL=true`, which accepts
  unverified certificates. Point `PGSSLROOTCERT` at your CA to tighten this.

