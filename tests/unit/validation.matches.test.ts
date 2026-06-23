import { describe, it, expect } from 'vitest';
import {
  createMatchSchema,
  listMatchesQuerySchema,
  matchIdParamSchema,
  updateScoreSchema,
} from '../../src/validation/matches.js';
import { liveMatchPayload } from '../helpers/factories.js';

describe('createMatchSchema', () => {
  it('accepts a valid payload', () => {
    const result = createMatchSchema.safeParse(liveMatchPayload());
    expect(result.success).toBe(true);
  });

  it.each(['sport', 'homeTeam', 'awayTeam'])('rejects when %s is missing', (field) => {
    const payload = liveMatchPayload();
    delete (payload as Record<string, unknown>)[field];

    const result = createMatchSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it.each(['sport', 'homeTeam', 'awayTeam'])('rejects when %s is an empty string', (field) => {
    const result = createMatchSchema.safeParse(liveMatchPayload({ [field]: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects a startTime that is not a valid ISO 8601 string', () => {
    const result = createMatchSchema.safeParse(liveMatchPayload({ startTime: 'tomorrow' }));
    expect(result.success).toBe(false);
  });

  it('rejects an endTime that is not a valid ISO 8601 string', () => {
    const result = createMatchSchema.safeParse(liveMatchPayload({ endTime: 'next week' }));
    expect(result.success).toBe(false);
  });

  // This is the superRefine check — the most important business rule in this
  // schema, so it gets its own focused test with a check on *where* the
  // error is attached (path: ['endTime']), not just that an error exists.
  it('rejects when endTime is before startTime, attaching the error to the endTime field', () => {
    const result = createMatchSchema.safeParse(
      liveMatchPayload({
        startTime: '2026-01-01T14:00:00.000Z',
        endTime:   '2026-01-01T12:00:00.000Z', // before start
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const endTimeIssue = result.error.issues.find((i) => i.path.join('.') === 'endTime');
      expect(endTimeIssue?.message).toBe('endTime must be chronologically after startTime');
    }
  });

  it('rejects when endTime equals startTime exactly', () => {
    const sameInstant = '2026-01-01T12:00:00.000Z';
    const result = createMatchSchema.safeParse(
      liveMatchPayload({ startTime: sameInstant, endTime: sameInstant }),
    );
    expect(result.success).toBe(false);
  });

  it('defaults homeScore/awayScore to undefined (caller applies the 0 default) when omitted', () => {
    const payload = liveMatchPayload();
    delete (payload as Record<string, unknown>).homeScore;
    delete (payload as Record<string, unknown>).awayScore;

    const result = createMatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.homeScore).toBeUndefined();
      expect(result.data.awayScore).toBeUndefined();
    }
  });

  it('rejects a negative homeScore', () => {
    const result = createMatchSchema.safeParse(liveMatchPayload({ homeScore: -1 }));
    expect(result.success).toBe(false);
  });

  it('coerces a numeric string homeScore to a number', () => {
    // nonNegativeInt uses z.coerce.number() — this documents that the body
    // schema accepts "5" the same way the query schema accepts "5" from a
    // query string. Useful to know since JSON normally sends real numbers.
    const result = createMatchSchema.safeParse(
      liveMatchPayload({ homeScore: '5' as unknown as number }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.homeScore).toBe(5);
  });
});

describe('listMatchesQuerySchema', () => {
  it('accepts an empty query (limit is optional)', () => {
    expect(listMatchesQuerySchema.safeParse({}).success).toBe(true);
  });

  it('coerces a string "10" to the number 10', () => {
    const result = listMatchesQuerySchema.safeParse({ limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(10);
  });

  it('rejects limit=0 (must be positive)', () => {
    expect(listMatchesQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit=101 (exceeds max of 100)', () => {
    expect(listMatchesQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('accepts limit=100 exactly (boundary)', () => {
    expect(listMatchesQuerySchema.safeParse({ limit: '100' }).success).toBe(true);
  });

  it('rejects a non-numeric limit', () => {
    expect(listMatchesQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
  });
});

describe('matchIdParamSchema', () => {
  it('coerces a numeric string id', () => {
    const result = matchIdParamSchema.safeParse({ id: '5' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id).toBe(5);
  });

  it('rejects id=0', () => {
    expect(matchIdParamSchema.safeParse({ id: '0' }).success).toBe(false);
  });

  it('rejects a non-numeric id', () => {
    expect(matchIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
  });
});

describe('updateScoreSchema', () => {
  it('accepts valid non-negative scores', () => {
    expect(updateScoreSchema.safeParse({ homeScore: 2, awayScore: 1 }).success).toBe(true);
  });

  it('rejects a negative score', () => {
    expect(updateScoreSchema.safeParse({ homeScore: -1, awayScore: 1 }).success).toBe(false);
  });

  it('rejects when homeScore is missing', () => {
    expect(updateScoreSchema.safeParse({ awayScore: 1 }).success).toBe(false);
  });
});
