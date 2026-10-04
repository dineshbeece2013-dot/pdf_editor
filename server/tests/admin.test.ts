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
const ADMIN_PASSWORD = 'admin-password-123';

async function registerUser(email: string) {
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

describe('admin authorisation', () => {
  it('answers 401 for a guest', async () => {
    const res = await h.client().get('/api/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Sign in required/);
  });

  it('answers 403 for a signed-in normal user', async () => {
    const { client } = await registerUser('user@example.com');
    const res = await client.get('/api/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Administrator/);
  });

  it('lets an admin list users without leaking password hashes', async () => {
    await registerUser('user@example.com');
    const admin = await loginAdmin();

    const res = await admin.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    for (const u of res.body.users) {
      expect(u).not.toHaveProperty('password_hash');
      expect(u).not.toHaveProperty('password');
    }
  });

  it('stops a normal user from promoting themselves', async () => {
    const { client, id } = await registerUser('sneaky@example.com');

    const direct = await client.patch(`/api/admin/users/${id}`, { role: 'admin' });
    expect(direct.status).toBe(403);

    const rows = await h.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [id]);
    expect(rows.rows[0]!.role).toBe('user');
  });
});

describe('admin user management', () => {
  it('promotes a user and demotes them back', async () => {
    const { id } = await registerUser('user@example.com');
    const admin = await loginAdmin();

    const promote = await admin.patch(`/api/admin/users/${id}`, { role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe('admin');

    const demote = await admin.patch(`/api/admin/users/${id}`, { role: 'user' });
    expect(demote.status).toBe(200);
    expect(demote.body.user.role).toBe('user');
  });

  it('refuses to demote itself', async () => {
    const adminId = await seedAdmin(h);
    const admin = await loginAdmin();

    const res = await admin.patch(`/api/admin/users/${adminId}`, { role: 'user' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
  });

  it('refuses to remove the last administrator', async () => {
    const adminId = await seedAdmin(h);
    const admin = await loginAdmin();

    // Promote a second admin, demote them, then try to demote the original —
    // by then they are the only admin left.
    const { id: otherId } = await registerUser('other@example.com');
    await admin.patch(`/api/admin/users/${otherId}`, { role: 'admin' });
    await admin.patch(`/api/admin/users/${otherId}`, { role: 'user' });

    const res = await admin.patch(`/api/admin/users/${adminId}`, { role: 'user' });
    expect(res.status).toBe(400);
  });

  it('rejects fields outside the allowlist', async () => {
    const { id } = await registerUser('user@example.com');
    const admin = await loginAdmin();

    for (const patch of [{ password_hash: 'x' }, { email: 'other@example.com' }, { id: 'nope' }]) {
      const res = await admin.patch(`/api/admin/users/${id}`, patch);
      expect(res.status).toBe(400);
    }
  });

  it('deletes another user but never itself', async () => {
    const adminId = await seedAdmin(h);
    const { id } = await registerUser('user@example.com');
    const admin = await loginAdmin();

    expect((await admin.del(`/api/admin/users/${adminId}`)).status).toBe(400);

    const removed = await admin.del(`/api/admin/users/${id}`);
    expect(removed.status).toBe(200);

    const left = await h.db.query('SELECT id FROM users WHERE id = $1', [id]);
    expect(left.rows).toHaveLength(0);
  });
});

describe('edit allowance is decided by the server', () => {
  it('gives a free account exactly one edit per day', async () => {
    const { client } = await registerUser('free@example.com');

    const before = await client.get('/api/me/edit-access');
    expect(before.status).toBe(200);
    expect(before.body.access.canEdit).toBe(true);
    expect(before.body.access.remainingFreeEdits).toBe(1);

    const first = await client.post('/api/me/edits');
    expect(first.status).toBe(200);
    expect(first.body.user.freeEditsUsedToday).toBe(1);

    const second = await client.post('/api/me/edits');
    expect(second.status).toBe(402);
    expect(second.body.error).toMatch(/free edit/i);
  });

  it('lets an admin edit without limit', async () => {
    const admin = await loginAdmin();

    const access = await admin.get('/api/me/edit-access');
    expect(access.body.access.canEdit).toBe(true);
    expect(access.body.access.planName).toMatch(/Admin/);

    for (let i = 0; i < 3; i += 1) {
      const res = await admin.post('/api/me/edits');
      expect(res.status).toBe(200);
    }
  });

  it('is unlimited once a subscription is granted', async () => {
    const { id } = await registerUser('pro@example.com');
    const admin = await loginAdmin();

    await admin.post(`/api/admin/users/${id}/grant`, { planId: 'pro-monthly' });

    const user = h.client();
    await user.post('/api/auth/login', { email: 'pro@example.com', password: PASSWORD });

    const access = await user.get('/api/me/edit-access');
    expect(access.body.access.isPro).toBe(true);
    expect((await user.post('/api/me/edits')).status).toBe(200);
    expect((await user.post('/api/me/edits')).status).toBe(200);
  });

  it('requires a session', async () => {
    expect((await h.client().get('/api/me/edit-access')).status).toBe(401);
    expect((await h.client().post('/api/me/edits')).status).toBe(401);
  });
});