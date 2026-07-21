import { PostHog } from 'posthog-node';

// Server-side product analytics — tracks business events (match created, score
// updates) as distinct from New Relic's error/performance monitoring. Env-gated
// like arcjet.ts: no key means posthog is null and every call site becomes a
// silent no-op.
const posthogKey = process.env.POSTHOG_KEY;

export const posthog = posthogKey
  ? new PostHog(posthogKey, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    })
  : null;
