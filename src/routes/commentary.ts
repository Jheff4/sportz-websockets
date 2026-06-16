import { Router, Request, Response } from 'express';
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
  type CreateCommentaryInput,
} from '../validation/commentary.js';
import { matchIdParamSchema } from '../validation/matches.js';
import { commentary } from '../db/schema.js';
import { db } from '../db/db.js';
import { eq, desc } from 'drizzle-orm';

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

// ─── GET /matches/:id/commentary ───────

commentaryRouter.get('/', async (req: Request, res: Response) => {
  const paramsParsed = matchIdParamSchema.safeParse(req.params);

  if (!paramsParsed.success) {
    return res.status(400).json({ error: 'Invalid match id.', details: paramsParsed.error.issues });
  }

  const queryParsed = listCommentaryQuerySchema.safeParse(req.query);

  if (!queryParsed.success) {
    return res.status(400).json({ error: 'Invalid query.', details: queryParsed.error.issues });
  }

  try {
    const { id: matchId } = paramsParsed.data;
    const { limit: queryLimit = 10 } = queryParsed.data;

    const safeLimit = Math.min(queryLimit, MAX_LIMIT);

    const results = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(safeLimit);

    res.status(200).json({ data: results });
  } catch (error) {
    console.error('Failed to fetch commentary:', error);
    res.status(500).json({ error: 'Failed to fetch commentary.' });
  }
});

// ─── POST /matches/:id/commentary ───────

commentaryRouter.post('/', async (req: Request, res: Response) => {
  const paramsParsed = matchIdParamSchema.safeParse(req.params);

  if (!paramsParsed.success) {
    return res.status(400).json({ error: 'Invalid match id.', details: paramsParsed.error.issues });
  }

  const bodyParsed = createCommentarySchema.safeParse(req.body);

  if (!bodyParsed.success) {
    return res.status(400).json({ error: 'Invalid payload.', details: bodyParsed.error.issues });
  }

  const { id: matchId } = paramsParsed.data;
  const body: CreateCommentaryInput = bodyParsed.data;

  try {
    const [event] = await db
      .insert(commentary)
      .values({ ...body, matchId })
      .returning();

    if (res.app.locals.broadcastCommentary) {
      res.app.locals.broadcastCommentary(matchId, event);
    }

    res.status(201).json({ data: event });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create commentary.', details: JSON.stringify(e) });
  }
});
