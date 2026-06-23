import { describe, it, expect, vi } from 'vitest';
import { getMatchStatus, syncMatchStatus } from '../../src/utils/match-status.js';
import { MATCH_STATUS } from '../../src/validation/matches.js';

describe('getMatchStatus', () => {
  it('returns SCHEDULED when now is before startTime', () => {
    const start = '2026-01-01T12:00:00.000Z';
    const end   = '2026-01-01T14:00:00.000Z';
    const now   = new Date('2026-01-01T11:00:00.000Z'); // 1 hour before start

    expect(getMatchStatus(start, end, now)).toBe(MATCH_STATUS.SCHEDULED);
  });

  it('returns LIVE when now is between startTime and endTime', () => {
    const start = '2026-01-01T12:00:00.000Z';
    const end   = '2026-01-01T14:00:00.000Z';
    const now   = new Date('2026-01-01T13:00:00.000Z'); // midway

    expect(getMatchStatus(start, end, now)).toBe(MATCH_STATUS.LIVE);
  });

  it('returns FINISHED when now is at or after endTime', () => {
    const start = '2026-01-01T12:00:00.000Z';
    const end   = '2026-01-01T14:00:00.000Z';
    const now   = new Date('2026-01-01T15:00:00.000Z'); // 1 hour after end

    expect(getMatchStatus(start, end, now)).toBe(MATCH_STATUS.FINISHED);
  });

  // Boundary tests — these are the cases most bugs hide in.
  it('treats now === startTime as LIVE (start boundary is inclusive)', () => {
    const start = '2026-01-01T12:00:00.000Z';
    const end   = '2026-01-01T14:00:00.000Z';
    const now   = new Date(start); // exactly at start

    // The implementation checks `now < start` for SCHEDULED, so now === start
    // falls through to LIVE — this test documents that exact behavior.
    expect(getMatchStatus(start, end, now)).toBe(MATCH_STATUS.LIVE);
  });

  it('treats now === endTime as FINISHED (end boundary is inclusive)', () => {
    const start = '2026-01-01T12:00:00.000Z';
    const end   = '2026-01-01T14:00:00.000Z';
    const now   = new Date(end); // exactly at end

    expect(getMatchStatus(start, end, now)).toBe(MATCH_STATUS.FINISHED);
  });

  it('returns null when startTime is not a valid date', () => {
    expect(getMatchStatus('not-a-date', '2026-01-01T14:00:00.000Z')).toBeNull();
  });

  it('returns null when endTime is not a valid date', () => {
    expect(getMatchStatus('2026-01-01T12:00:00.000Z', 'not-a-date')).toBeNull();
  });

  it('defaults now to the current time when not provided', () => {
    // A match that started 1 day ago and ends 1 day from now is LIVE
    // *right now*, regardless of when this test happens to run.
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end   = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    expect(getMatchStatus(start, end)).toBe(MATCH_STATUS.LIVE);
  });
});

describe('syncMatchStatus', () => {
  it('does NOT call updateStatus when the computed status matches the current one', async () => {
    const updateStatus = vi.fn().mockResolvedValue(undefined);
    const match = {
      startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      endTime:   new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: MATCH_STATUS.LIVE, // already correct
    };

    const result = await syncMatchStatus(match, updateStatus);

    expect(updateStatus).not.toHaveBeenCalled();
    expect(result).toBe(MATCH_STATUS.LIVE);
  });

  it('calls updateStatus and mutates match.status when the computed status differs', async () => {
    const updateStatus = vi.fn().mockResolvedValue(undefined);
    const match = {
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      endTime:   new Date(Date.now() - 60 * 60 * 1000).toISOString(), // already ended
      status: MATCH_STATUS.LIVE, // stale — should become FINISHED
    };

    const result = await syncMatchStatus(match, updateStatus);

    expect(updateStatus).toHaveBeenCalledExactlyOnceWith(MATCH_STATUS.FINISHED);
    expect(match.status).toBe(MATCH_STATUS.FINISHED);
    expect(result).toBe(MATCH_STATUS.FINISHED);
  });

  it('returns the existing status without calling updateStatus when dates are invalid', async () => {
    const updateStatus = vi.fn().mockResolvedValue(undefined);
    const match = {
      startTime: 'garbage',
      endTime: 'also-garbage',
      status: MATCH_STATUS.SCHEDULED,
    };

    const result = await syncMatchStatus(match, updateStatus);

    expect(updateStatus).not.toHaveBeenCalled();
    expect(result).toBe(MATCH_STATUS.SCHEDULED);
  });
});
