import { z } from 'zod';

// ─── Reusable primitives ─────

/** Coerces a query-string value to an integer and checks it is ≥ 1. */
const positiveInt = z.coerce.number().int().positive();

/** Coerces a query-string value to an integer and checks it is ≥ 0. */
const nonNegativeInt = z.coerce.number().int().nonnegative();

// ─── Query schemas ─────

export const listCommentaryQuerySchema = z.object({
  limit: positiveInt.max(100).optional(),
});

// ─── Body schemas ─────

export const createCommentarySchema = z.object({
  // Nullable in DB — optional in payload
  minute: nonNegativeInt.optional(),
  period: z.string().optional(),
  actor: z.string().optional(),
  team: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),

  // Required — notNull() in DB and mandatory for every event
  sequence: positiveInt,
  eventType: z.string().min(1, 'eventType is required'),
  message: z.string().min(1, 'message is required'),
});

// ─── Inferred Types ─────

export type ListCommentaryQuery = z.infer<typeof listCommentaryQuerySchema>;
export type CreateCommentaryInput = z.infer<typeof createCommentarySchema>;
