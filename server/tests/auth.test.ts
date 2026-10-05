import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHarness, seedAdmin, TestClient, type Harness } from './helpers.js';

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

  it('cannot be used without a session', async () => {
    const res = await h.client().post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'brand-new-password',
    });
    expect(res.status).toBe(401);
  });

  it('keeps the caller signed in afterwards', async () => {
    const c = h.client();
    await c.post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: PASSWORD });

    const changed = await c.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'brand-new-password',
    });
    expect(changed.status).toBe(200);

    // The old session id was replaced, but the caller must not be logged out.
    const me = await c.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ada@example.com');
  });

  it('enforces the minimum length', async () => {
    const c = h.client();
    await c.post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: PASSWORD });

    const res = await c.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8/);
  });
});
describe('malformed request bodies', () => {
  it('answers 400 instead of 500 when the JSON body cannot be parsed', async () => {
    const res = await h.client().postRaw('/api/auth/login', '{email:user@pdfpro.com,}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed request body.');
  });

  it('does not echo the rejected body back to the client', async () => {
    const secretish = '{oops:"super-secret-value"}';
    const res = await h.client().postRaw('/api/auth/login', secretish);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-value');
  });
});

describe('multiple allowed origins', () => {
  // A 401 "invalid credentials" proves the request got past the CSRF guard;
  // a 403 "Cross-origin request blocked" means the guard stopped it.
  const CREDS = { email: 'nobody@example.com', password: 'whatever-1' };

  it('accepts every listed origin, case-insensitively', async () => {
    const multi = await createHarness({ APP_ORIGIN: 'https://apex.example,https://www.apex.example' });
    try {
      for (const origin of ['https://apex.example', 'https://www.apex.example', 'https://APEX.example']) {
        const res = await new TestClient(multi.base, origin).post('/api/auth/login', CREDS);
        expect(res.status, `origin ${origin} should be allowed`).toBe(401);
      }
    } finally {
      await multi.close();
    }
  });

  it('still refuses an origin that is not listed', async () => {
    const multi = await createHarness({ APP_ORIGIN: 'https://apex.example,https://www.apex.example' });
    try {
      const res = await new TestClient(multi.base, 'https://evil.example').post('/api/auth/login', CREDS);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Cross-origin/);
    } finally {
      await multi.close();
    }
  });

  it('does not treat a different scheme, port or subdomain as the same origin', async () => {
    const multi = await createHarness({ APP_ORIGIN: 'https://apex.example,https://www.apex.example' });
    try {
      for (const origin of ['http://apex.example', 'https://apex.example:8443', 'https://sub.apex.example']) {
        const res = await new TestClient(multi.base, origin).post('/api/auth/login', CREDS);
        expect(res.status, `origin ${origin} must be blocked`).toBe(403);
      }
    } finally {
      await multi.close();
    }
  });
});