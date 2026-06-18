import http from 'http';
import { Duplex } from 'stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import type { Commentary, Match } from '../db/schema.js';
import { wsArcjet } from '../arcjet.js';
import { logger } from '../utils/logger.js';

// ─── Types ─────────────────────────────────────────

/** WebSocket extended with per-connection state. */
interface SportzSocket extends WebSocket {
  isAlive: boolean;
  subscriptions: Set<number>;
}

/** All outbound WebSocket message shapes. */
interface WsPayload {
  type: string;
  [key: string]: unknown;
}

// ─── Subscription registry ───────────────────

const matchSubscribers = new Map<number, Set<SportzSocket>>();

function subscribe(matchId: number, socket: SportzSocket): void {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }
  matchSubscribers.get(matchId)!.add(socket);
}

function unsubscribe(matchId: number, socket: SportzSocket): void {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers) return;
  subscribers.delete(socket);
  if (subscribers.size === 0) matchSubscribers.delete(matchId);
}

function cleanupSubscriptions(socket: SportzSocket): void {
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId, socket);
  }
}

// ─── Send helpers ─────────────────────────────────────────

function sendJson(socket: WebSocket, payload: WsPayload): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss: WebSocketServer, payload: WsPayload): void {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(JSON.stringify(payload));
  }
}

function broadcastToMatch(matchId: number, payload: WsPayload): void {
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers || subscribers.size === 0) return;
  const message = JSON.stringify(payload);
  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

// ─── Message handler ─────────────────────────────────────────

function handleMessage(socket: SportzSocket, data: RawData): void {
  let message: unknown;

  try {
    message = JSON.parse(data.toString());
  } catch {
    sendJson(socket, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  if (
    typeof message !== 'object' ||
    message === null ||
    !('type' in message) ||
    !('matchId' in message)
  )
    return;

  const { type, matchId } = message as { type: unknown; matchId: unknown };

  if (!Number.isInteger(matchId)) return;

  if (type === 'subscribe') {
    subscribe(matchId as number, socket);
    socket.subscriptions.add(matchId as number);
    sendJson(socket, { type: 'subscribed', matchId });
    return;
  }

  if (type === 'unsubscribe') {
    unsubscribe(matchId as number, socket);
    socket.subscriptions.delete(matchId as number);
    sendJson(socket, { type: 'unsubscribed', matchId });
  }
}

// ─── Server ─────────────────────────────────────────

export function attachWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  server.on('upgrade', async (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);
        if (decision.isDenied()) {
          socket.write(
            decision.reason.isRateLimit()
              ? 'HTTP/1.1 429 Too Many Requests\r\n\r\n'
              : 'HTTP/1.1 403 Forbidden\r\n\r\n'
          );
          socket.destroy();
          return;
        }
      } catch (e) {
        logger.error('WS upgrade protection error', { error: e });
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (socket: WebSocket) => {
    const ws = socket as SportzSocket;
    ws.isAlive = true;
    ws.subscriptions = new Set();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    sendJson(ws, { type: 'welcome' });

    ws.on('message', (data) => handleMessage(ws, data));

    ws.on('error', () => ws.terminate());
    ws.on('close', () => cleanupSubscriptions(ws));
  });

  const interval = setInterval(() => {
    wss.clients.forEach((socket) => {
      const ws = socket as SportzSocket;
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  // ─── Broadcast API (injected into app.locals) ───────────────────────────────

  function broadcastMatchCreated(match: Match): void {
    broadcastToAll(wss, { type: 'match_created', data: match });
  }

  function broadcastCommentary(matchId: number, comment: Commentary): void {
    broadcastToMatch(matchId, { type: 'commentary', data: comment });
  }

  return { broadcastMatchCreated, broadcastCommentary };
}
