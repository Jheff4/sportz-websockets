// =============================================================================
// factories.ts — builds valid request payloads with sensible defaults
// =============================================================================
// WHY FACTORIES INSTEAD OF INLINE OBJECTS IN EVERY TEST:
// Every test that creates a match needs a startTime/endTime pair that's
// actually valid (endTime after startTime, both valid ISO strings). Writing
// `new Date(...).toISOString()` in 15 different tests is repetitive and a
// typo in one test silently weakens what that test is actually checking.
// A factory means "give me a valid match payload" and override only the
// field the specific test cares about.
// =============================================================================

interface MatchPayloadOverrides {
  sport?: string;
  homeTeam?: string;
  awayTeam?: string;
  startTime?: string;
  endTime?: string;
  homeScore?: number;
  awayScore?: number;
}

/** A match that is currently LIVE: started 1 hour ago, ends 1 hour from now. */
export function liveMatchPayload(overrides: MatchPayloadOverrides = {}) {
  const now = Date.now();
  return {
    sport: 'football',
    homeTeam: 'Redwood United',
    awayTeam: 'Kingsport FC',
    startTime: new Date(now - 60 * 60 * 1000).toISOString(),
    endTime: new Date(now + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/** A match that hasn't started yet: starts 1 hour from now. */
export function scheduledMatchPayload(overrides: MatchPayloadOverrides = {}) {
  const now = Date.now();
  return {
    sport: 'cricket',
    homeTeam: 'Forest Rangers',
    awayTeam: 'Sunset Blazers',
    startTime: new Date(now + 60 * 60 * 1000).toISOString(),
    endTime: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/** A match that has already ended. */
export function finishedMatchPayload(overrides: MatchPayloadOverrides = {}) {
  const now = Date.now();
  return {
    sport: 'basketball',
    homeTeam: 'Iron Valley Titans',
    awayTeam: 'Crescent City Hoops',
    startTime: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(now - 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

interface CommentaryPayloadOverrides {
  minute?: number;
  sequence?: number;
  period?: string;
  eventType?: string;
  actor?: string;
  team?: string;
  message?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export function commentaryPayload(overrides: CommentaryPayloadOverrides = {}) {
  return {
    sequence: 1,
    eventType: 'GOAL',
    message: 'A composed finish from close range.',
    minute: 23,
    period: '1st half',
    actor: 'Bukayo Saka',
    team: 'Redwood United',
    tags: ['goal', 'first-half'],
    ...overrides,
  };
}
