import express, { Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { matchRouter } from './routes/matches.js';
import { commentaryRouter } from './routes/commentary.js';
import { securityMiddleware } from './arcjet.js';
import { logger } from './utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// createApp() — builds the Express app WITHOUT starting an HTTP listener.
//
// WHY THIS EXISTS:
// index.ts used to build the app AND call server.listen() in one file. That
// meant importing index.ts anywhere (e.g. from a test) bound a real OS port
// as a side effect. supertest needs a plain Express app object it can drive
// directly in-memory — no port required. Separating "build the app" from
// "run the app" is what makes the whole route layer testable.
// ─────────────────────────────────────────────────────────────────────────────
export function createApp() {
  const app = express();

  // ─── Security ─────
  app.use(helmet());

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000',
      credentials: true,
    })
  );

  // ─── HTTP request logging ─────
  app.use(
    morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      stream: { write: (message) => logger.http(message.trim()) },
    })
  );

  // ─── Body parsing + cookies ─────
  app.use(express.json());
  app.use(cookieParser());

  // ─── Routes ─────
  app.get('/', (_req: Request, res: Response) => {
    res.send({ message: 'Sportz server is running!' });
  });

  app.use(securityMiddleware());

  app.use('/matches', matchRouter);
  app.use('/matches/:id/commentary', commentaryRouter);

  return app;
}
