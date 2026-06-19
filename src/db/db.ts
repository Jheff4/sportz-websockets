import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

// ── SSL configuration ──────────────────────────────────────────────────────
// Neon Cloud (production) issues valid TLS certificates → rejectUnauthorized
// must be true (the default) so we can detect man-in-the-middle attacks.
//
// Neon Local (development) uses a self-signed certificate. The pg driver
// rejects self-signed certs by default, so we disable that check locally.
//
// Set DATABASE_SSL_REJECT_UNAUTHORIZED=false in .env.development to allow it.
// Leave it unset (or true) everywhere else.
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized },
});

export const db = drizzle(pool);
