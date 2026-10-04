import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import { Database } from '../src/db/index.js';
import { runMigrations } from '../src/migrate.js';

/**
 * Proves the schema is executable and that pg-mem understands it, which is what
 * lets the rest of the suite run without a PostgreSQL server installed.
 */
describe('schema', () => {
  it('applies cleanly', async () => {
    const memory = newDb({ autoCreateForeignKeyIndices: true });
    const { Pool } = memory.adapters.createPg();
    const pool = new Pool();
    const db = new Database(pool as never);

    await runMigrations(db);

    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const names = tables.rows.map((r) => r.table_name);
    for (const expected of ['users', 'payments', 'razorpay_config', 'user_sessions']) {
      expect(names).toContain(expected);
    }

    await pool.end();
  });
});
