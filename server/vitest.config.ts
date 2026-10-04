import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Argon2id is intentionally expensive (19 MiB, 2 passes), and the suite
    // hashes a lot of passwords.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One file at a time: each boots its own in-memory database.
    fileParallelism: false,
  },
});
