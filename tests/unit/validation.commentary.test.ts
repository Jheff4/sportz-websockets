import { describe, it, expect } from 'vitest';
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from '../../src/validation/commentary.js';
import { commentaryPayload } from '../helpers/factories.js';

describe('createCommentarySchema', () => {
  it('accepts a full valid payload', () => {
    expect(createCommentarySchema.safeParse(commentaryPayload()).success).toBe(true);
  });

  it('accepts the minimal required fields only (sequence, eventType, message)', () => {
    const result = createCommentarySchema.safeParse({
      sequence: 1,
      eventType: 'GOAL',
      message: 'Goal!',
    });
    expect(result.success).toBe(true);
  });

  it.each(['sequence', 'eventType', 'message'])('rejects when required field %s is missing', (field) => {
    const payload = commentaryPayload();
    delete (payload as Record<string, unknown>)[field];

    expect(createCommentarySchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an empty eventType string', () => {
    expect(createCommentarySchema.safeParse(commentaryPayload({ eventType: '' })).success).toBe(false);
  });

  it('rejects an empty message string', () => {
    expect(createCommentarySchema.safeParse(commentaryPayload({ message: '' })).success).toBe(false);
  });

  it('rejects sequence=0 (must be positive, not just non-negative)', () => {
    expect(createCommentarySchema.safeParse(commentaryPayload({ sequence: 0 })).success).toBe(false);
  });

  it('rejects a negative minute', () => {
    expect(createCommentarySchema.safeParse(commentaryPayload({ minute: -1 })).success).toBe(false);
  });

  it('accepts minute=0 (kickoff — non-negative, not positive-only)', () => {
    expect(createCommentarySchema.safeParse(commentaryPayload({ minute: 0 })).success).toBe(true);
  });

  it('omits optional fields cleanly when not provided', () => {
    const result = createCommentarySchema.safeParse({
      sequence: 1,
      eventType: 'KICKOFF',
      message: 'Match underway.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minute).toBeUndefined();
      expect(result.data.actor).toBeUndefined();
      expect(result.data.tags).toBeUndefined();
    }
  });

  it('accepts a tags array of strings', () => {
    const result = createCommentarySchema.safeParse(commentaryPayload({ tags: ['goal', 'first-half'] }));
    expect(result.success).toBe(true);
  });

  it('rejects tags containing a non-string element', () => {
    const result = createCommentarySchema.safeParse(
      commentaryPayload({ tags: ['goal', 123] as unknown as string[] }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a metadata object with arbitrary keys', () => {
    const result = createCommentarySchema.safeParse(
      commentaryPayload({ metadata: { xg: 0.34, assistedBy: 'Saka' } }),
    );
    expect(result.success).toBe(true);
  });
});

describe('listCommentaryQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(listCommentaryQuerySchema.safeParse({}).success).toBe(true);
  });

  it('coerces a numeric string limit', () => {
    const result = listCommentaryQuerySchema.safeParse({ limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(25);
  });

  it('rejects limit exceeding 100', () => {
    expect(listCommentaryQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('rejects limit=0', () => {
    expect(listCommentaryQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});
