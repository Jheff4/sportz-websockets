import { WebSocket, WebSocketServer } from 'ws';

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
};

function sendJson(socket: WebSocket, payload: Record<string, any>) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

function broadcast(wss: WebSocketServer, payload: Record<string, any>) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(JSON.stringify(payload));
  }
}

export function attachWebSocketServer(server: any) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

  wss.on('connection', (socket: WebSocket) => {
    sendJson(socket, { type: 'welcome' });

    socket.on('error', console.error);
  });

  function broadcastMatchCreated(match: Match) {
    broadcast(wss, { type: 'match_created', data: match });
  }
  
  return { broadcastMatchCreated };
}
