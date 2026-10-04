import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHarness, seedAdmin, type Harness } from './helpers.js';
import { computeRazorpaySignature } from '../src/security/razorpaySignature.js';

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await h.close();
});

const PASSWORD = 'correct-horse-battery';
const ADMIN_PASSWORD = 'admin-password-123';
const KEY_ID = 'rzp_test_abcdefghijklmnop';
const KEY_SECRET = 'super_secret_value_never_sent_to_the_browser';

async function registerUser(email = 'user@example.com') {
  const c = h.client();
  const res = await c.post('/api/auth/register', { name: 'Regular User', email, password: PASSWORD });
  return { client: c, id: res.body.user.id as string };
}

async function loginAdmin() {
  await seedAdmin(h);
  const c = h.client();
  await c.post('/api/auth/login', { email: 'admin@pdfpro.com', password: ADMIN_PASSWORD });
  return c;
}

async function configureGateway() {
  const admin = await loginAdmin();
  const res = await admin.put('/api/razorpay/config', {
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    currency: 'INR',
  });
  expect(res.status).toBe(200);
  return admin;
}

/** Create a real order through the API, exactly as the checkout button does. */
async function orderForUser(client: ReturnType<typeof h.client>) {
  const res = await client.post('/api/subscription/order', { planId: 'pro-monthly' });
  return res.body as { orderId: string; amount: number; currency: string };
}

describe('gateway secrets stay on the server', () => {
  it('never returns the key secret, to anyone', async () => {
    await configureGateway();

    const guestView = await h.client().get('/api/razorpay/config');
    expect(guestView.status).toBe(200);
    expect(guestView.body).not.toHaveProperty('keySecret');
    expect(JSON.stringify(guestView.body)).not.toContain(KEY_SECRET);
    expect(guestView.body.keyId).toBe(KEY_ID);
    expect(guestView.body.hasSecret).toBe(true);

    // Even an admin only ever sees the "a secret is set" flag.
    const admin = await loginAdmin();
    const adminView = await admin.get('/api/razorpay/config');
    expect(JSON.stringify(adminView.body)).not.toContain(KEY_SECRET);
  });

  it('stores the secret encrypted at rest', async () => {
    await configureGateway();

    const rows = await h.db.query<{ key_secret_enc: string | null }>(
      'SELECT key_secret_enc FROM razorpay_config WHERE id = 1',
    );
    const stored = rows.rows[0]!.key_secret_enc;

    expect(stored).toBeTruthy();
    expect(stored).not.toContain(KEY_SECRET);
    // iv.tag.ciphertext envelope
    expect(String(stored).split('.')).toHaveLength(3);
  });

  it('refuses to let a normal user change the gateway config', async () => {
    const { client } = await registerUser();
    const res = await client.put('/api/razorpay/config', { keyId: KEY_ID, keySecret: 'stolen' });
    expect(res.status).toBe(403);

    const rows = await h.db.query('SELECT key_id FROM razorpay_config WHERE id = 1');
    expect(rows.rows).toHaveLength(0);
  });

  it('rejects a malformed key id', async () => {
    const admin = await loginAdmin();
    const res = await admin.put('/api/razorpay/config', { keyId: 'not-a-razorpay-key' });
    expect(res.status).toBe(400);
  });
});

describe('subscription orders are priced server-side', () => {
  it('refuses to create an order before the gateway is configured', async () => {
    const { client } = await registerUser();
    const res = await client.post('/api/subscription/order', { planId: 'pro-monthly' });
    expect(res.status).toBe(503);
  });

  it('prices the order from its own catalogue', async () => {
    await configureGateway();
    const { client } = await registerUser();

    const res = await client.post('/api/subscription/order', { planId: 'pro-monthly' });
    expect(res.status).toBe(201);
    // The client cannot influence this number.
    expect(res.body.amount).toBe(300);
    expect(res.body.currency).toBe('INR');
    expect(res.body.keyId).toBe(KEY_ID);
    expect(res.body.orderId).toMatch(/^order_/);
  });

  it('rejects an unknown plan id', async () => {
    await configureGateway();
    const { client } = await registerUser();
    const res = await client.post('/api/subscription/order', { planId: 'pro-lifetime-cheap' });
    expect(res.status).toBe(400);
  });

  it('requires a signed-in user', async () => {
    await configureGateway();
    const res = await h.client().post('/api/subscription/order', { planId: 'pro-monthly' });
    expect(res.status).toBe(401);
  });
});

describe('payment verification', () => {
  it('rejects a forged signature and leaves the user on free', async () => {
    await configureGateway();
    const { client } = await registerUser();
    const order = await orderForUser(client);

    const res = await client.post('/api/subscription/verify', {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: 'pay_forged',
      razorpay_signature: 'deadbeef'.repeat(8),
    });
    expect(res.status).toBe(400);

    const rows = await h.db.query<{ plan: string }>('SELECT plan FROM users WHERE email = $1', [
      'user@example.com',
    ]);
    expect(rows.rows[0]!.plan).toBe('free');
  });

  it('rejects a signature computed with the wrong secret', async () => {
    await configureGateway();
    const { client } = await registerUser();
    const order = await orderForUser(client);

    const res = await client.post('/api/subscription/verify', {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: 'pay_guessed',
      razorpay_signature: computeRazorpaySignature(order.orderId, 'pay_guessed', 'not-the-secret'),
    });
    expect(res.status).toBe(400);
  });

  it('accepts a genuine signature and activates the plan', async () => {
    await configureGateway();
    const { client } = await registerUser();
    const order = await orderForUser(client);

    const paymentId = 'pay_genuine_1';
    const res = await client.post('/api/subscription/verify', {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: computeRazorpaySignature(order.orderId, paymentId, KEY_SECRET),
    });

    expect(res.status).toBe(200);
    expect(res.body.user.plan).toBe('pro');
    expect(res.body.user.subscriptionPlan).toBe('pro-monthly');
    expect(res.body.user.subscriptionExpiresAt).toBeGreaterThan(Date.now());

    const payment = await h.db.query<{ status: string; amount: number }>(
      'SELECT status, amount::double precision AS amount FROM payments WHERE razorpay_payment_id = $1',
      [paymentId],
    );
    expect(payment.rows[0]!.status).toBe('captured');
    expect(Number(payment.rows[0]!.amount)).toBe(3);
  });

  it('is idempotent when the browser retries verification', async () => {
    await configureGateway();
    const { client } = await registerUser();
    const order = await orderForUser(client);

    const paymentId = 'pay_retry';
    const payload = {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: computeRazorpaySignature(order.orderId, paymentId, KEY_SECRET),
    };

    const first = await client.post('/api/subscription/verify', payload);
    expect(first.body.replay).toBe(false);

    const second = await client.post('/api/subscription/verify', payload);
    expect(second.status).toBe(200);
    expect(second.body.replay).toBe(true);
    expect(second.body.user.plan).toBe('pro');

    const count = await h.db.query('SELECT id FROM payments WHERE razorpay_payment_id = $1', [paymentId]);
    expect(count.rows).toHaveLength(1);
  });

  it("will not let one account verify another account's order", async () => {
    await configureGateway();
    const victim = await registerUser('victim@example.com');
    const attacker = await registerUser('attacker@example.com');
    const order = await orderForUser(victim.client);

    const paymentId = 'pay_stolen';
    const res = await attacker.client.post('/api/subscription/verify', {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: computeRazorpaySignature(order.orderId, paymentId, KEY_SECRET),
    });

    expect(res.status).toBe(404);
    const rows = await h.db.query<{ plan: string }>('SELECT plan FROM users WHERE email = $1', [
      'attacker@example.com',
    ]);
    expect(rows.rows[0]!.plan).toBe('free');
  });
});

describe('demo payments', () => {
  it('grants Pro when explicitly enabled', async () => {
    const { client } = await registerUser();
    const res = await client.post('/api/subscription/demo', { planId: 'pro-weekly' });
    expect(res.status).toBe(200);
    expect(res.body.user.plan).toBe('pro');
    expect(res.body.user.subscriptionPlan).toBe('pro-weekly');
  });

  it('is refused when disabled, even for a signed-in user', async () => {
    await h.close();
    h = await createHarness({ ALLOW_DEMO_PAYMENTS: 'false' });

    const { client } = await registerUser();
    const res = await client.post('/api/subscription/demo', { planId: 'pro-weekly' });
    expect(res.status).toBe(403);

    const rows = await h.db.query<{ plan: string }>('SELECT plan FROM users WHERE email = $1', [
      'user@example.com',
    ]);
    expect(rows.rows[0]!.plan).toBe('free');
  });
});

describe('payment ledger', () => {
  it('shows an admin every payment with revenue totals', async () => {
    await configureGateway();
    const { client } = await registerUser();
    const order = await orderForUser(client);
    const paymentId = 'pay_listed';
    await client.post('/api/subscription/verify', {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: computeRazorpaySignature(order.orderId, paymentId, KEY_SECRET),
    });

    const admin = await loginAdmin();
    const res = await admin.get('/api/admin/payments');

    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].razorpayPaymentId).toBe(paymentId);
    expect(res.body.payments[0].userEmail).toBe('user@example.com');
    expect(res.body.revenue.INR).toBe(3);
  });

  it('keeps the all-payments ledger out of reach of a normal user', async () => {
    await configureGateway();
    const { client } = await registerUser();
    expect((await client.get('/api/admin/payments')).status).toBe(403);
    // ...but they can see their own history.
    const own = await client.get('/api/payments');
    expect(own.status).toBe(200);
    expect(own.body.payments).toEqual([]);
  });
});