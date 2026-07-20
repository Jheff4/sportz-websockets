import { Router, Request, Response } from 'express';
import {
  createMatchSchema,
  listMatchesQuerySchema,
  matchIdParamSchema,
  updateScoreSchema,
  MATCH_STATUS,
  type CreateMatchInput,
  type ListMatchesQuery,
  type UpdateScoreInput,
} from '../validation/matches.js';
import { matches } from '../db/schema.js';
import { db } from '../db/db.js';
import { getMatchStatus } from '../utils/match-status.js';
import { logger } from '../utils/logger.js';
import { desc, eq } from 'drizzle-orm';

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get('/', async (req: Request, res: Response) => {
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query.', details: parsed.error.issues });
  }

  const { limit }: ListMatchesQuery = parsed.data;
  const resolvedLimit = Math.min(limit ?? 50, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(resolvedLimit);

    res.json({ data });
  } catch (e) {
    logger.error('Failed to list matches:', e);
    res.status(500).json({ error: 'Failed to list matches.' });
  }
});

matchRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createMatchSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload.', details: parsed.error.issues });
  }

  const { startTime, endTime, homeScore, awayScore }: CreateMatchInput = parsed.data;

  try {
    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore: homeScore ?? 0,
        awayScore: awayScore ?? 0,
        status: getMatchStatus(startTime, endTime) ?? MATCH_STATUS.SCHEDULED,
      })
      .returning();

    if (res.app.locals.broadcastMatchCreated) {
      res.app.locals.broadcastMatchCreated(event);
    }

    res.status(201).json({ data: event });
  } catch (e) {
    logger.error('Failed to create match:', e);
    res.status(500).json({ error: 'Failed to create match.' });
  }
});

// PATCH /matches/:id/score — set the live score and push it to every client.
matchRouter.patch('/:id/score', async (req: Request, res: Response) => {
  const paramsParsed = matchIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    return res.status(400).json({ error: 'Invalid match id.', details: paramsParsed.error.issues });
  }

  const bodyParsed = updateScoreSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Invalid payload.', details: bodyParsed.error.issues });
  }

  const { id } = paramsParsed.data;
  const { homeScore, awayScore }: UpdateScoreInput = bodyParsed.data;

  try {
    const [updated] = await db
      .update(matches)
      .set({ homeScore, awayScore })
      .where(eq(matches.id, id))
      .returning();

    // No row updated → the match id doesn't exist.
    if (!updated) {
      return res.status(404).json({ error: 'Match not found.' });
    }

    // Broadcast the whole updated match so clients can replace it in their cache.
    if (res.app.locals.broadcastScoreUpdate) {
      res.app.locals.broadcastScoreUpdate(updated);
    }

    res.json({ data: updated });
  } catch (e) {
    logger.error('Failed to update score:', e);
    res.status(500).json({ error: 'Failed to update score.' });
  }
});
