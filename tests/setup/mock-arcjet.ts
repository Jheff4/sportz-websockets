import { vi } from 'vitest';

// =============================================================================
// mock-arcjet.ts — runs once, before any test file is imported
// =============================================================================
//
// WHY THIS FILE MUST RUN FIRST:
// src/arcjet.ts has this line at module scope:
//   if (!arcjetKey) throw new Error('ARCJET_KEY environment variable is missing.');
// That throw happens the INSTANT the module is imported — before any test
// even runs. If ARCJET_KEY isn't set in the environment, importing app.ts
// (which imports arcjet.ts) crashes test collection entirely, before a
// single test executes. Setting it here, in a setupFile, guarantees it
// exists before any test file's imports are evaluated.
//
// ??= ("logical OR assignment") only sets the value if it's not already
// set — so if CI provides a real ARCJET_KEY via secrets, this won't
// clobber it. Locally, this dummy value is all you need since Arcjet calls
// are mocked below anyway.
// =============================================================================

process.env.ARCJET_KEY ??= 'test_arcjet_key_for_vitest';
process.env.ARCJET_MODE ??= 'DRY_RUN';
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://sportz_test:sportz_test@localhost:5432/sportz_test';
process.env.CORS_ORIGIN ??= 'http://localhost:3000';

// The default DATABASE_URL above points at a plain `postgres:16-alpine`
// container (see DOCKER.md / the test-running instructions) — not Neon.
// That container has no SSL configured at all, so src/db/db.ts must be told
// not to attempt an SSL handshake against it. If you point DATABASE_URL at
// a real Neon database instead, set DATABASE_SSL=true (or unset this) before
// running tests.
process.env.DATABASE_SSL ??= 'false';

// =============================================================================
// Mock @arcjet/node entirely.
//
// WHY MOCK INSTEAD OF USING THE REAL THING:
// arcjet().protect(req) makes a real network call to Arcjet's API to evaluate
// the request. In tests this would mean:
//   1. Every test run depends on network access and Arcjet's uptime — flaky.
//   2. Every test run consumes your real Arcjet request quota.
//   3. Tests become slow (network round-trip per request).
// The mock below makes protect() always resolve to "allowed" by default, so
// route/WS tests run instantly and deterministically. Individual tests can
// override this per-call using vi.mocked() to simulate a denial — see
// tests/ws/websocket.test.ts for an example of testing the deny path.
// =============================================================================

vi.mock('@arcjet/node', () => {
  const allowDecision = {
    isDenied: () => false,
    reason: { isRateLimit: () => false },
  };

  return {
    default: vi.fn(() => ({
      protect: vi.fn().mockResolvedValue(allowDecision),
    })),
    detectBot: vi.fn(() => ({})),
    shield: vi.fn(() => ({})),
    slidingWindow: vi.fn(() => ({})),
  };
});
