import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Database } from './db/index.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './migrate.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const pool = createPool(config);
  const db = new Database(pool);

  // Every statement is IF NOT EXISTS, so this is safe on each boot.
  await runMigrations(db);

  const app = createApp({ config, db, pool });

  const server = app.listen(config.port, config.host, () => {
    console.log(`[api] listening on http://${config.host}:${config.port} (${config.env})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => {
      void db.close().finally(() => process.exit(0));
    });
    // Do not wait forever for lingering keep-alive sockets.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
