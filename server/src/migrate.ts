import type { Queryable } from './db/index.js';
import { SCHEMA_SQL } from './db/schema.js';

/**
 * Apply the schema. Every statement is `IF NOT EXISTS`, so this is safe to run
 * on every boot — that is what makes it a migration rather than a one-off.
 */
export async function runMigrations(db: Queryable): Promise<void> {
  await db.query(SCHEMA_SQL);
}
