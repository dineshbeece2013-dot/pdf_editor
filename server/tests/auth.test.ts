import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHarness, seedAdmin, type Harness } from './helpers.js';

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await h.close();
});

const PASSWORD = 'correct-horse-battery';

describe('registration', () => {
  it('creates a user, signs them in, and never returns a password', async () => {
    const c = h.client();
    const res = await c.post('/api/auth/register', {
      name: 'Ada Lovelace',
      email: 'Ada@Example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('ada@example.com'); // normalised
    expect(res.body.user.role).toBe('user');
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(c.cookieHeader).toContain('pdfpro.sid=');
  });

  it('issues an httpOnly, SameSite=Lax session cookie', async () => {
    const c = h.client();
    const res = await c.post('/api/auth/register', {
      name: 'Grace Hopper',
      email: 'grace@example.com',
      password: PASSWORD,
    });

    const cookie = res.setCookies.find((c) => c.startsWith('pdfpro.sid='));
    expect(cookie).toBeDefined();
    expect(cookie!.toLowerCase()).toContain('httponly');
    expect(cookie!.toLowerCase()).toContain('samesite=lax');
  });

  it('cannot be used to self-assign the admin role', async () => {
    const c = h.client();
    const res = await c.post('/api/auth/register', {
      name: 'Mallory',
      email: 'mallory@example.com',
      password: PASSWORD,
      role: 'admin',
      isAdmin: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');

    const rows = await h.db.query<{ role: string }>('SELECT role FROM users WHERE email = $1', [
      'mallory@example.com',
    ]);
    expect(rows.rows[0]!.role).toBe('user');
  });

  it('stores only an Argon2id hash, never the plaintext', async () => {
    await h.client().post('/api/auth/register', {
      name: 'Alan Turing',
      email: 'alan@example.com',
      password: PASSWORD,
    });

    const rows = await h.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      ['alan@example.com'],
    );
    const stored = rows.rows[0]!.password_hash;

    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).not.toContain(PASSWORD);
  });

  it('rejects a duplicate email and a too-short password', async () => {
    const c = h.client();
    await c.post('/api/auth/register', { name: 'First User', email: 'dupe@example.com', password: PASSWORD });

    const dupe = await c.post('/api/auth/register', {
      name: 'Second User',
      email: 'dupe@example.com',
      password: PASSWORD,
    });
    expect(dupe.status).toBe(409);

    const weak = await c.post('/api/auth/register', {
      name: 'Third User',
      email: 'weak@example.com',
      password: 'short',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatch(/at least 8/);
  });
});

describe('login and sessions', () => {
  it('rejects a wrong password and accepts the right one', async () => {
    await h.client().post('/api/auth/register', {
      name: 'Ada',
      email: 'ada@example.com',
      password: PASSWORD,
    });

    const attacker = h.client();
    const bad = await attacker.post('/api/auth/login', {
      email: 'ada@example.com',
      password: 'not-the-password',
    });
    expect(bad.status).toBe(401);
    // The message must not reveal whether the account exists.
    expect(bad.body.error).toBe('Invalid email or password.');

    const user = h.client();
    const good = await user.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
    expect(good.status).toBe(200);
    expect(good.body.user.email).toBe('ada@example.com');
  });

  it('returns the same message for an unknown account', async () => {
    const c = h.client();
    const res = await c.post('/api/auth/login', {
      email: 'nobody@example.com',
      password: PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  it('keeps the session across requests and drops it on logout', async () => {
    const c = h.client();
    await c.post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: PASSWORD });

    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ada@example.com');

    await c.post('/api/auth/logout');
    const after = await c.get('/api/auth/me');
    expect(after.body.user).toBeNull();
  });

  it('treats a visitor with no cookie as a guest rather than an error', async () => {
    const c = h.client();
    const res = await c.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('lets a signed-in user change their password', async () => {
    const c = h.client();
    await c.post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: PASSWORD });

    const wrong = await c.post('/api/auth/password', {
      currentPassword: 'nope',
      newPassword: 'brand-new-password',
    });
    expect(wrong.status).toBe(401);

    const ok = await c.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'brand-new-password',
    });
    expect(ok.status).toBe(200);

    const fresh = h.client();
    const relogin = await fresh.post('/api/auth/login', {
      email: 'ada@example.com',
      password: 'brand-new-password',
    });
    expect(relogin.status).toBe(200);

    const old = h.client();
    const stale = await old.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
    expect(stale.status).toBe(401);
  });
});