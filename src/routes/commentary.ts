import { Router, Request, Response } from 'express';
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
  type CreateCommentaryInput,
  type ListCommentaryQuery,
} from '../validation/commentary.js';
import { matchIdParamSchema, type MatchIdParam } from '../validation/matches.js';
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

  const { id }: MatchIdParam = paramsParsed.data;
  const { limit }: ListCommentaryQuery = queryParsed.data;
  const resolvedLimit = Math.min(limit ?? MAX_LIMIT, MAX_LIMIT);

  try {
    const data = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, id))
      .orderBy(desc(commentary.createdAt))
      .limit(resolvedLimit);

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list commentary.' });
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

  const { id }: MatchIdParam = paramsParsed.data;
  const body: CreateCommentaryInput = bodyParsed.data;

  try {
    const [event] = await db
      .insert(commentary)
      .values({ ...body, matchId: id })
      .returning();

    if (res.app.locals.broadcastCommentary) {
      res.app.locals.broadcastCommentary(id, event);
    }

    res.status(201).json({ data: event });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create commentary.', details: JSON.stringify(e) });
  }
});
