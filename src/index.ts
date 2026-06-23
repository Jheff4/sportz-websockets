import http from 'http';
import { createApp } from './app.js';
import { attachWebSocketServer } from './ws/server.js';
import { logger } from './utils/logger.js';

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();
const server = http.createServer(app);

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
