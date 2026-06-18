import AgentAPI from 'apminsight';
AgentAPI.config();

import express, { Request, Response } from 'express';
import http from 'http';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { matchRouter } from './routes/matches.js';
import { attachWebSocketServer } from './ws/server.js';
import { securityMiddleware } from './arcjet.js';
import { commentaryRouter } from './routes/commentary.js';
import { logger } from './utils/logger.js';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

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

// ─── WebSocket ─────
const { broadcastMatchCreated, broadcastCommentary } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;

// ─── Start ─────
server.listen(PORT, HOST, () => {
  const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  logger.info(`Server running at ${baseUrl}`);
  logger.info(`WebSocket server running at ${baseUrl.replace('http', 'ws')}/ws`);
});
