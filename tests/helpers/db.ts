import { sql } from 'drizzle-orm';
import { db, pool } from '../../src/db/db.js';

// =============================================================================
// resetDb() — wipes both tables and resets auto-increment IDs to 1
// =============================================================================
// WHY TRUNCATE ... RESTART IDENTITY CASCADE instead of db.delete():
//   - TRUNCATE is much faster than DELETE for clearing a whole table (no
//     row-by-row scanning/logging).
//   - RESTART IDENTITY resets the `serial` primary key sequence back to 1.
//     Without this, match IDs would keep climbing across test runs (test 1
//     creates match id=1, test 2's "first match" would be id=2, etc.) —
//     making assertions like expect(body.data.id).toBe(1) test-order-
//     dependent and fragile.
//   - CASCADE handles the matches → commentary foreign key automatically,
//     so we don't need to truncate in a specific order.
//
// WHY beforeEach NOT beforeAll:
// Each test gets a completely empty, deterministic database. Without this,
// a test earlier in the file could leave data that silently makes a later
// test pass (or fail) for the wrong reason.
// =============================================================================
export async function resetDb(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE commentary, matches RESTART IDENTITY CASCADE`);
}

// =============================================================================
// closeDb() — ends the pg Pool's open connections
// =============================================================================
// WHY THIS IS NEEDED:
// pg.Pool keeps TCP connections open indefinitely for reuse. Without calling
// pool.end() in an afterAll, Vitest's process never sees all handles close,
// and the test run hangs after the last test finishes (or only exits because
// of a forced timeout). One call per test file, in afterAll, is enough.
// =============================================================================
export async function closeDb(): Promise<void> {
  await pool.end();
}
