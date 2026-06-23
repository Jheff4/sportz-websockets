import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDb, closeDb } from '../helpers/db.js';
import { liveMatchPayload, commentaryPayload } from '../helpers/factories.js';

const app = createApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

/** Creates a match via the real API and returns its id — every commentary
 *  test needs a real matchId to satisfy the foreign key constraint. */
async function createMatch(): Promise<number> {
  const res = await request(app).post('/matches').send(liveMatchPayload());
  return res.body.data.id as number;
}

describe('GET /matches/:id/commentary', () => {
  it('rejects a non-numeric match id with 400', async () => {
    const res = await request(app).get('/matches/abc/commentary');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid match id.');
  });

  it('returns an empty list for a match with no commentary yet', async () => {
    const matchId = await createMatch();
    const res = await request(app).get(`/matches/${matchId}/commentary`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('returns commentary events ordered most-recent-first', async () => {
    const matchId = await createMatch();

    await request(app).post(`/matches/${matchId}/commentary`).send(
      commentaryPayload({ sequence: 1, message: 'First event' }),
    );
    await request(app).post(`/matches/${matchId}/commentary`).send(
      commentaryPayload({ sequence: 2, message: 'Second event' }),
    );

    const res = await request(app).get(`/matches/${matchId}/commentary`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].message).toBe('Second event');
    expect(res.body.data[1].message).toBe('First event');
  });

  it('only returns commentary belonging to the requested match', async () => {
    const matchA = await createMatch();
    const matchB = await createMatch();

    await request(app).post(`/matches/${matchA}/commentary`).send(
      commentaryPayload({ message: 'Belongs to A' }),
    );
    await request(app).post(`/matches/${matchB}/commentary`).send(
      commentaryPayload({ message: 'Belongs to B' }),
    );

    const res = await request(app).get(`/matches/${matchA}/commentary`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].message).toBe('Belongs to A');
  });

  it('rejects an invalid limit query with 400', async () => {
    const matchId = await createMatch();
    const res = await request(app).get(`/matches/${matchId}/commentary`).query({ limit: 'abc' });
    expect(res.status).toBe(400);
  });

  it('rejects a limit above 100 with 400', async () => {
    const matchId = await createMatch();
    const res = await request(app).get(`/matches/${matchId}/commentary`).query({ limit: 500 });
    expect(res.status).toBe(400);
  });
});

describe('POST /matches/:id/commentary', () => {
  it('rejects a non-numeric match id with 400', async () => {
    const res = await request(app).post('/matches/abc/commentary').send(commentaryPayload());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid match id.');
  });

  it('creates a commentary event and returns 201', async () => {
    const matchId = await createMatch();
    const payload = commentaryPayload();

    const res = await request(app).post(`/matches/${matchId}/commentary`).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      matchId,
      eventType: payload.eventType,
      message: payload.message,
      sequence: payload.sequence,
    });
  });

  it('rejects a payload missing required fields with 400', async () => {
    const matchId = await createMatch();
    const res = await request(app).post(`/matches/${matchId}/commentary`).send({ minute: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid payload.');
  });

  it('rejects sequence=0 with 400', async () => {
    const matchId = await createMatch();
    const res = await request(app)
      .post(`/matches/${matchId}/commentary`)
      .send(commentaryPayload({ sequence: 0 }));

    expect(res.status).toBe(400);
  });

  // KNOWN BEHAVIOR — documented, not (yet) fixed:
  // The route does not check whether the match exists before inserting.
  // Posting commentary for a non-existent matchId hits the database's
  // foreign key constraint, which the route's catch block turns into a
  // generic 500 rather than a more accurate 404 "Match not found".
  // This test documents the CURRENT behavior so a future fix is a
  // deliberate, visible change (the test will need updating to expect 404),
  // not a silent regression nobody notices.
  it('returns 500 (not 404) when posting commentary for a non-existent match — flagged as a known gap', async () => {
    const nonExistentMatchId = 999999;
    const res = await request(app)
      .post(`/matches/${nonExistentMatchId}/commentary`)
      .send(commentaryPayload());

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create commentary.');
  });

  it('calls app.locals.broadcastCommentary with the matchId and created event', async () => {
    const matchId = await createMatch();
    const broadcastSpy = vi.fn();
    app.locals.broadcastCommentary = broadcastSpy;

    const payload = commentaryPayload();
    const res = await request(app).post(`/matches/${matchId}/commentary`).send(payload);

    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith(
      matchId,
      expect.objectContaining({ id: res.body.data.id, message: payload.message }),
    );

    delete app.locals.broadcastCommentary;
  });

  it('does not throw when broadcastCommentary is not set on app.locals', async () => {
    delete app.locals.broadcastCommentary;
    const matchId = await createMatch();

    const res = await request(app).post(`/matches/${matchId}/commentary`).send(commentaryPayload());
    expect(res.status).toBe(201);
  });
});
