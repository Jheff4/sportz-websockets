import http from 'http';
import { createApp } from './app.js';
import { attachWebSocketServer } from './ws/server.js';
import { startDemoSimulator } from './demo/simulator.js';
import { logger } from './utils/logger.js';

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();
const server = http.createServer(app);

// ─── WebSocket ─────
const { broadcastMatchCreated, broadcastCommentary, broadcastScoreUpdate } =
  attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;
app.locals.broadcastScoreUpdate = broadcastScoreUpdate;

// ─── Demo mode ─────
// When DEMO_MODE=true, run the in-process simulator so the deployed app is
// always "live" for visitors (no external producer needed). See demo/simulator.
if (process.env.DEMO_MODE === 'true') {
  startDemoSimulator({ broadcastMatchCreated, broadcastCommentary, broadcastScoreUpdate });
}

// ─── Start ─────
server.listen(PORT, HOST, () => {
  const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  logger.info(`Server running at ${baseUrl}`);
  logger.info(`WebSocket server running at ${baseUrl.replace('http', 'ws')}/ws`);
});
