import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createPool } from './db/pool.js';
import { Database } from './db/index.js';
import { runMigrations } from './migrate.js';
import { createUser, findByEmail } from './repositories/users.js';
import { hashPassword, validatePassword } from './security/password.js';

/**
 * Create the bootstrap administrator.
 *
 * This is the ONLY way an admin account comes into existence — registration
 * hardcodes role='user' and the admin API requires an existing admin — so it
 * is a manual, server-side operation driven by ADMIN_EMAIL/ADMIN_PASSWORD.
 *
 * Safe to re-run: an existing account is left untouched.
 */
async function main(): Promise<void> {
  const { loadConfig } = await import('./config.js');
  const config = loadConfig();

  const db = new Database(createPool(config));
  try {
    await runMigrations(db);

    const { email, password, name } = config.admin;
    if (!password) {
      throw new Error('ADMIN_PASSWORD is not set. Add it to server/.env before seeding.');
    }
    const problem = validatePassword(password);
    if (problem) throw new Error(problem);

    const existing = await findByEmail(db, email);
    if (existing) {
      console.log(`[seed] ${email} already exists (role=${existing.role}). Nothing to do.`);
      return;
    }

    await createUser(db, {
      id: randomUUID(),
      name,
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
    });
    console.log(`[seed] Created administrator ${email}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
