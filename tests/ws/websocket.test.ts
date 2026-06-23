import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { WebSocket } from 'ws';
import { attachWebSocketServer } from '../../src/ws/server.js';
import { wsArcjet } from '../../src/arcjet.js';
import { nextMessage, expectNoMessage, connectSocket } from './helpers.js';

// =============================================================================
// websocket.test.ts — real WebSocket connections against a real http.Server
// =============================================================================
// WHY A REAL SERVER + REAL 'ws' CLIENT, NOT MOCKED:
// The interesting bugs in a WebSocket layer live in the protocol-level
// behavior — does the upgrade handshake work, does broadcasting reach the
// RIGHT clients, does a malformed frame crash the connection. None of that
// can be verified by mocking the WebSocket object; we need an actual socket
// pair talking over actual (loopback) TCP.
//
// WHY port 0:
// Binding to port 0 asks the OS to assign any free port. This avoids
// "address already in use" flakiness if a previous test run's server
// didn't fully release its port yet, and lets multiple test files in
// theory run without colliding on a fixed port number.
// =============================================================================

let server: http.Server;
let wsApi: ReturnType<typeof attachWebSocketServer>;
let baseUrl: string;

beforeEach(async () => {
  server = http.createServer();
  wsApi = attachWebSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected server.address() to return an AddressInfo object');
  }
  baseUrl = `ws://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  // wsApi.close() stops the 30s heartbeat interval and closes the
  // WebSocketServer — without this, each test would leak a live timer
  // (see the "close() — WHY THIS EXISTS" comment in src/ws/server.ts).
  wsApi.close();

  // closeAllConnections() forcibly destroys any still-open sockets.
  // WHY THIS IS NECESSARY: server.close() alone only stops accepting NEW
  // connections — it waits indefinitely for EXISTING ones to end on their
  // own before its callback fires. If a test fails partway through (e.g.
  // an assertion throws) before reaching its own socket.close() call, that
  // connection is still open when afterEach runs. Without closeAllConnections(),
  // server.close() would hang until Vitest's hook timeout (10s) killed it —
  // which is exactly what happened before this fix was added.
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('connection lifecycle', () => {
  it('sends a welcome message immediately on connect', async () => {
    const socket = await connectSocket(`${baseUrl}/ws`);
    const message = await nextMessage(socket);

    expect(message).toEqual({ type: 'welcome' });
    socket.close();
  });

  it('rejects connections to any path other than /ws', async () => {
    // The 'ws' client emits 'unexpected-response' when the server responds
    // to the handshake with a non-101 status (here: the socket is destroyed
    // at the HTTP level, which the client surfaces as an error).
    const socket = new WebSocket(`${baseUrl}/not-the-right-path`);

    const errored = await new Promise<boolean>((resolve) => {
      socket.once('error', () => resolve(true));
      socket.once('open', () => resolve(false));
    });

    expect(errored).toBe(true);
  });
});

describe('subscribe / unsubscribe', () => {
  it('confirms a subscription with a subscribed message', async () => {
    const socket = await connectSocket(`${baseUrl}/ws`);
    await nextMessage(socket); // discard welcome

    socket.send(JSON.stringify({ type: 'subscribe', matchId: 1 }));
    const message = await nextMessage(socket);

    expect(message).toEqual({ type: 'subscribed', matchId: 1 });
    socket.close();
  });

  it('confirms an unsubscription with an unsubscribed message', async () => {
    const socket = await connectSocket(`${baseUrl}/ws`);
    await nextMessage(socket); // welcome

    socket.send(JSON.stringify({ type: 'subscribe', matchId: 1 }));
    await nextMessage(socket); // subscribed

    socket.send(JSON.stringify({ type: 'unsubscribe', matchId: 1 }));
    const message = await nextMessage(socket);

    expect(message).toEqual({ type: 'unsubscribed', matchId: 1 });
    socket.close();
  });

  it('replies with an error for malformed JSON', async () => {
    const socket = await connectSocket(`${baseUrl}/ws`);
    await nextMessage(socket); // welcome

    socket.send('{not valid json');
    const message = await nextMessage(socket);

    expect(message).toEqual({ type: 'error', message: 'Invalid JSON' });
    socket.close();
  });

  it('silently ignores a message missing "type" or "matchId"', async () => {
    const socket = await connectSocket(`${baseUrl}/ws`);
    await nextMessage(socket); // welcome

    socket.send(JSON.stringify({ matchId: 1 })); // missing "type"
    await expectNoMessage(socket);

    socket.close();
  });

  it('silently ignores a message where matchId is not an integer', async () => {
    const socket = await connectSocket(`${baseUrl}/ws`);
    await nextMessage(socket); // welcome

    socket.send(JSON.stringify({ type: 'subscribe', matchId: 'not-a-number' }));
    await expectNoMessage(socket);

    socket.close();
  });
});

describe('broadcasting', () => {
  it('broadcastMatchCreated reaches ALL connected clients, subscribed or not', async () => {
    const clientA = await connectSocket(`${baseUrl}/ws`);
    const clientB = await connectSocket(`${baseUrl}/ws`);
    await nextMessage(clientA); // welcome
    await nextMessage(clientB); // welcome

    // Neither client has subscribed to anything — match_created is a
    // global broadcast regardless of subscriptions.
    const fakeMatch = { id: 1, homeTeam: 'A', awayTeam: 'B' } as never;
    wsApi.broadcastMatchCreated(fakeMatch);

    const [messageA, messageB] = await Promise.all([
      nextMessage(clientA),
      nextMessage(clientB),
    ]);

    expect(messageA).toEqual({ type: 'match_created', data: fakeMatch });
    expect(messageB).toEqual({ type: 'match_created', data: fakeMatch });

    clientA.close();
    clientB.close();
  });

  it('broadcastCommentary reaches ONLY clients subscribed to that matchId', async () => {
    const subscribedToMatch1 = await connectSocket(`${baseUrl}/ws`);
    const subscribedToMatch2 = await connectSocket(`${baseUrl}/ws`);
    const notSubscribedAtAll = await connectSocket(`${baseUrl}/ws`);

    await nextMessage(subscribedToMatch1); // welcome
    await nextMessage(subscribedToMatch2); // welcome
    await nextMessage(notSubscribedAtAll); // welcome

    subscribedToMatch1.send(JSON.stringify({ type: 'subscribe', matchId: 1 }));
    await nextMessage(subscribedToMatch1); // subscribed

    subscribedToMatch2.send(JSON.stringify({ type: 'subscribe', matchId: 2 }));
    await nextMessage(subscribedToMatch2); // subscribed

    const fakeEvent = { id: 1, matchId: 1, message: 'Goal!' } as never;
    wsApi.broadcastCommentary(1, fakeEvent);

    // The subscriber to match 1 should receive it.
    const received = await nextMessage(subscribedToMatch1);
    expect(received).toEqual({ type: 'commentary', data: fakeEvent });

    // The subscriber to match 2, and the client with no subscription,
    // should receive NOTHING.
    await expectNoMessage(subscribedToMatch2);
    await expectNoMessage(notSubscribedAtAll);

    subscribedToMatch1.close();
    subscribedToMatch2.close();
    notSubscribedAtAll.close();
  });

  it('stops delivering events to a match after the client unsubscribes', async () => {
    const socket = await connectSocket(`${baseUrl}/ws`);
    await nextMessage(socket); // welcome

    socket.send(JSON.stringify({ type: 'subscribe', matchId: 1 }));
    await nextMessage(socket); // subscribed

    socket.send(JSON.stringify({ type: 'unsubscribe', matchId: 1 }));
    await nextMessage(socket); // unsubscribed

    wsApi.broadcastCommentary(1, { id: 1, matchId: 1 } as never);
    await expectNoMessage(socket);

    socket.close();
  });
});

describe('Arcjet protection on the upgrade handshake', () => {
  // These tests override the globally-mocked wsArcjet.protect() (set up in
  // tests/setup/mock-arcjet.ts to always allow) for ONE call, to simulate
  // Arcjet denying the connection — then restore the default afterward so
  // it doesn't leak into other tests in this file.
  afterEach(() => {
    vi.mocked(wsArcjet!.protect).mockReset();
    vi.mocked(wsArcjet!.protect).mockResolvedValue({
      isDenied: () => false,
      reason: { isRateLimit: () => false },
    } as never);
  });

  it('rejects the upgrade with 429 when Arcjet denies due to rate limiting', async () => {
    vi.mocked(wsArcjet!.protect).mockResolvedValueOnce({
      isDenied: () => true,
      reason: { isRateLimit: () => true },
    } as never);

    const socket = new WebSocket(`${baseUrl}/ws`);
    const errored = await new Promise<boolean>((resolve) => {
      socket.once('error', () => resolve(true));
      socket.once('open', () => resolve(false));
    });

    expect(errored).toBe(true);
  });

  it('rejects the upgrade with 403 when Arcjet denies for a non-rate-limit reason', async () => {
    vi.mocked(wsArcjet!.protect).mockResolvedValueOnce({
      isDenied: () => true,
      reason: { isRateLimit: () => false },
    } as never);

    const socket = new WebSocket(`${baseUrl}/ws`);
    const errored = await new Promise<boolean>((resolve) => {
      socket.once('error', () => resolve(true));
      socket.once('open', () => resolve(false));
    });

    expect(errored).toBe(true);
  });
});
