import express, { Request, Response } from 'express';
import http from 'http';
import { matchRouter } from './routes/matches.js';
import { attachWebSocketServer } from './ws/server.js';
import { securityMiddleware } from './arcjet.js';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send({ message: 'Sportz server is running!' });
});

app.use(securityMiddleware());

app.use('/matches', matchRouter);

const { broadcastMatchCreated } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;

server.listen(PORT, HOST, () => {
  const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Server running at ${baseUrl}`);
  console.log(`WebSocket server is running on ${baseUrl.replace('http', 'ws')}/ws`);
});

// attachWebSocketServer(server);

