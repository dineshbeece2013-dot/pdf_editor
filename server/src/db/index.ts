import type { Pool, PoolClient } from 'pg';
import type { QueryResultRow } from 'pg';

/** Anything that can run a parameterised query — a pool, a transaction, or the DB itself. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

/**
 * Thin wrapper over a pg Pool that exposes the two things the app needs:
 * a single query and a transaction helper. Everything is parameterised — no
 * user input is ever concatenated into SQL.
 */
export class Database implements Queryable {
  constructor(private readonly pool: Pool) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const result = await this.pool.query(text, values as unknown[]);
    return { rows: result.rows as T[], rowCount: result.rowCount };
  }

  /** Run `fn` inside a single transaction, committing on success and rolling back on throw. */
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    const tx: Queryable = {
      query: async <R extends QueryResultRow>(text: string, values: readonly unknown[] = []) => {
        const result = await client.query(text, values as unknown[]);
        return { rows: result.rows as R[], rowCount: result.rowCount };
      },
    };
    try {
      await client.query('BEGIN');
      const out = await fn(tx);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* the connection is already broken; the original error is more useful */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
