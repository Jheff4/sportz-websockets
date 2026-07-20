// New Relic's agent patches Node's module loader to auto-instrument express,
// pg, and http — it only works if it loads before anything else does. Under
// ESM, static imports in index.ts are evaluated before that file's own body
// runs, so a conditional import inside index.ts would load too late. This
// file has no other imports, so the conditional below is guaranteed to run
// first.
if (process.env.NEW_RELIC_LICENSE_KEY) {
  await import('newrelic');
}

await import('./index.js');
