import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDb, closeDb } from '../helpers/db.js';
import { liveMatchPayload, scheduledMatchPayload, finishedMatchPayload } from '../helpers/factories.js';

// =============================================================================
// matches.routes.test.ts — integration tests against a REAL Postgres database
// =============================================================================
// WHY INTEGRATION NOT UNIT HERE:
// These tests exercise the full request path: Express routing → Zod
// validation → Drizzle query → real Postgres → response serialization.
// Mocking the database would mean we're testing our mocks, not our SQL.
// The one thing we DO mock is Arcjet (see tests/setup/mock-arcjet.ts) —
// that's a third-party network call, not part of "our" logic.
//
// REQUIRES: a live Postgres reachable at DATABASE_URL with migrations
// applied. Run `docker compose -f docker-compose.dev.yml up` (Neon Local)
// or point DATABASE_URL at any local Postgres, then `npm run db:migrate`.
// =============================================================================

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe('GET /matches', () => {
  it('returns an empty list when there are no matches', async () => {
    const res = await request(app).get('/matches');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('returns created matches ordered most-recent-first', async () => {
    // Create two matches in sequence — the second should come first in the
    // response since the route orders by desc(createdAt).
    await request(app).post('/matches').send(liveMatchPayload({ homeTeam: 'First Created' }));
    await request(app).post('/matches').send(liveMatchPayload({ homeTeam: 'Second Created' }));

    const res = await request(app).get('/matches');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].homeTeam).toBe('Second Created');
    expect(res.body.data[1].homeTeam).toBe('First Created');
  });

  it('respects the limit query parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/matches').send(liveMatchPayload({ homeTeam: `Team ${i}` }));
    }

    const res = await request(app).get('/matches').query({ limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('rejects an invalid limit with 400 and validation details', async () => {
    const res = await request(app).get('/matches').query({ limit: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid query.');
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it('rejects a limit above 100 with 400', async () => {
    const res = await request(app).get('/matches').query({ limit: 101 });
    expect(res.status).toBe(400);
  });

  it('accepts limit=100 exactly (boundary)', async () => {
    const res = await request(app).get('/matches').query({ limit: 100 });
    expect(res.status).toBe(200);
  });
});

describe('POST /matches', () => {
  it('creates a match and returns 201 with the created record', async () => {
    const payload = liveMatchPayload();
    const res = await request(app).post('/matches').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      sport: payload.sport,
      homeTeam: payload.homeTeam,
      awayTeam: payload.awayTeam,
      homeScore: 0,
      awayScore: 0,
    });
    expect(res.body.data.id).toBeTypeOf('number');
  });

  it('computes status=live for a match whose window includes now', async () => {
    const res = await request(app).post('/matches').send(liveMatchPayload());
    expect(res.body.data.status).toBe('live');
  });

  it('computes status=scheduled for a match that starts in the future', async () => {
    const res = await request(app).post('/matches').send(scheduledMatchPayload());
    expect(res.body.data.status).toBe('scheduled');
  });

  it('computes status=finished for a match that has already ended', async () => {
    const res = await request(app).post('/matches').send(finishedMatchPayload());
    expect(res.body.data.status).toBe('finished');
  });

  it('defaults homeScore and awayScore to 0 when omitted', async () => {
    const payload = liveMatchPayload();
    delete (payload as Record<string, unknown>).homeScore;
    delete (payload as Record<string, unknown>).awayScore;

    const res = await request(app).post('/matches').send(payload);

    expect(res.body.data.homeScore).toBe(0);
    expect(res.body.data.awayScore).toBe(0);
  });

  it('rejects a payload missing required fields with 400', async () => {
    const res = await request(app).post('/matches').send({ sport: 'football' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload.');
  });

  it('rejects endTime before startTime with 400', async () => {
    const res = await request(app).post('/matches').send(
      liveMatchPayload({
        startTime: '2026-06-01T14:00:00.000Z',
        endTime:   '2026-06-01T12:00:00.000Z',
      }),
    );

    expect(res.status).toBe(400);
    const endTimeIssue = res.body.details.find((d: { path: string[] }) => d.path[0] === 'endTime');
    expect(endTimeIssue.message).toBe('endTime must be chronologically after startTime');
  });

  it('calls app.locals.broadcastMatchCreated with the created match', async () => {
    // WHY A SPY HERE: the WS broadcast function is injected into app.locals
    // by index.ts in production. The route guards with
    // `if (res.app.locals.broadcastMatchCreated) { ... }` — so this test
    // verifies the route actually calls it with the right data, without
    // needing a real WebSocket connection. The WS layer's own behavior
    // (who receives the broadcast) is covered separately in tests/ws/.
    const broadcastSpy = vi.fn();
    app.locals.broadcastMatchCreated = broadcastSpy;

    const payload = liveMatchPayload();
    const res = await request(app).post('/matches').send(payload);

    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ homeTeam: payload.homeTeam, id: res.body.data.id }),
    );

    delete app.locals.broadcastMatchCreated;
  });

  it('does not throw when broadcastMatchCreated is not set on app.locals', async () => {
    // Defensive check: in tests where app.locals isn't wired up the way
    // index.ts wires it in production, the route should still succeed.
    delete app.locals.broadcastMatchCreated;

    const res = await request(app).post('/matches').send(liveMatchPayload());
    expect(res.status).toBe(201);
  });
});
