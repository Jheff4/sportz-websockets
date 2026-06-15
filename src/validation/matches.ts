import { z } from 'zod';

// ─── Constants ─────

export const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  FINISHED: 'finished',
} as const;

// ─── Reusable primitives ─────

/** Coerces a query-string value to an integer and checks it is ≥ 1. */
const positiveInt = z.coerce.number().int().positive();

/** Coerces a query-string value to an integer and checks it is ≥ 0. */
const nonNegativeInt = z.coerce.number().int().nonnegative();

/** Accepts a string and checks it parses as a valid ISO 8601 date. */
const isoDateString = z.iso.datetime();

// ─── Query schemas ─────

export const listMatchesQuerySchema = z.object({
  limit: positiveInt.max(100).optional(),
});

// ─── Param schemas ─────

export const matchIdParamSchema = z.object({
  id: positiveInt,
});

// ─── Body schemas ─────

export const createMatchSchema = z
  .object({
    sport: z.string().min(1, 'sport is required'),
    homeTeam: z.string().min(1, 'homeTeam is required'),
    awayTeam: z.string().min(1, 'awayTeam is required'),
    startTime: isoDateString,
    endTime: isoDateString,
    homeScore: nonNegativeInt.optional(),
    awayScore: nonNegativeInt.optional(),
  })
  .superRefine((data, ctx) => {
    if (Date.parse(data.endTime) <= Date.parse(data.startTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be chronologically after startTime',
      });
    }
  });

export const updateScoreSchema = z.object({
  homeScore: nonNegativeInt,
  awayScore: nonNegativeInt,
});

// ─── Inferred Types ─────

export type ListMatchesQuery = z.infer<typeof listMatchesQuerySchema>;
export type MatchIdParam = z.infer<typeof matchIdParamSchema>;
export type CreateMatchInput = z.infer<typeof createMatchSchema>;
export type UpdateScoreInput = z.infer<typeof updateScoreSchema>;
