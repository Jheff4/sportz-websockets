'use strict';

// New Relic looks for this file (or newrelic.js) relative to the process cwd.
// Named .cjs because package.json sets "type": "module" — the agent's config
// loader expects CommonJS.
//
// Values come entirely from env vars (render.yaml / your local .env) so
// nothing here needs to change between environments. bootstrap.ts only
// imports the agent at all when NEW_RELIC_LICENSE_KEY is set, so this file
// is inert otherwise.
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'sportz-backend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY || '',
  distributed_tracing: { enabled: true },
  logging: { level: 'info' },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
    ],
  },
};
