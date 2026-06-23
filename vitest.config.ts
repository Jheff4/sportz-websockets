import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',

    // globals: false means describe/it/expect must be explicitly imported
    // from 'vitest' in every test file. Slightly more typing, but it's
    // immediately clear where these functions come from — useful while
    // you're still learning the framework.
    globals: false,

    // Runs before any test file is imported. This is where we set fallback
    // env vars (ARCJET_KEY, DATABASE_URL) and mock @arcjet/node — both MUST
    // happen before src/arcjet.ts is ever imported, since it throws at
    // import time if ARCJET_KEY is missing.
    setupFiles: ['./tests/setup/mock-arcjet.ts'],

    // Integration tests share one real Postgres database and truncate
    // tables between tests rather than using transactions-per-test. Running
    // test files in parallel would cause two files to truncate each other's
    // data mid-run. fileParallelism: false runs test FILES sequentially
    // (tests within a file can still share fixtures via beforeEach).
    fileParallelism: false,

    testTimeout: 15000,

    coverage: {
      provider: 'v8',
      // 'github-actions' reporter prints failing assertions as inline
      // ::error:: annotations directly on the PR diff in CI.
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      exclude: ['dist/**', 'drizzle/**', 'tests/**', '**/*.config.ts'],
    },
  },
})
