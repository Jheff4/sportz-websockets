import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

// ── SSL configuration ──────────────────────────────────────────────────────
// There are three distinct situations this needs to handle, not two:
//
// 1. Neon Cloud (production) — issues valid TLS certificates. SSL must be
//    attempted AND certificates must be verified (rejectUnauthorized: true).
//
// 2. Neon Local (development) — uses a self-signed certificate. SSL must
//    still be attempted, but certificate verification must be skipped
//    (rejectUnauthorized: false), otherwise the self-signed cert is rejected.
//
// 3. A plain local/CI Postgres container (e.g. `postgres:16-alpine` used for
//    running tests) — has NO SSL configured at all. Passing ANY `ssl` object
//    here — even `{ rejectUnauthorized: false }` — tells the pg driver to
//    attempt an SSL handshake. A vanilla Postgres with no certs configured
//    responds to that attempt with "the server does not support SSL
//    connections," and the connection fails outright. This case needs SSL
//    OFF ENTIRELY (`ssl: false`), not just relaxed certificate checking —
//    those are two different things that look similar but aren't.
//
// DATABASE_SSL controls which of these three situations we're in:
//   unset / 'true'  → attempt SSL (cases 1 and 2 — Neon Cloud or Neon Local)
//   'false'         → don't attempt SSL at all (case 3 — plain test/CI Postgres)
//
// DATABASE_SSL_REJECT_UNAUTHORIZED then only matters WITHIN the "SSL is on"
// branch, to distinguish case 1 (Neon Cloud, verify certs) from case 2
// (Neon Local, skip verification for its self-signed cert).
const sslEnabled = process.env.DATABASE_SSL !== 'false';
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized } : false,
});

export const db = drizzle(pool);
