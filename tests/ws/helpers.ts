import { WebSocket } from 'ws';

// =============================================================================
// WHY THIS FILE LOOKS THE WAY IT DOES — a real race condition, found by
// actually running these tests:
//
// The original version of this helper waited for the 'open' event, resolved
// connectSocket()'s Promise, and only THEN did the test call nextMessage()
// to attach a 'message' listener. That's a race: the server sends its
// "welcome" message essentially synchronously as part of completing the
// handshake. In a standalone diagnostic script, 'open' and the first
// 'message' fired ONE MILLISECOND apart. If the 'message' event fires
// before nextMessage() has attached its listener, Node's EventEmitter does
// not queue it for a future listener — it's gone. Every WS test timed out
// waiting for a message that had, in fact, already arrived and been
// silently dropped.
//
// THE FIX: attach a single persistent 'message' listener the INSTANT the
// socket is constructed (before 'open' even fires, before any await).
// That listener pushes every incoming message into a queue. nextMessage()
// then either pops an already-queued message immediately, or registers
// a "waiter" callback that fires the moment a new message arrives. This
// makes message delivery order-independent of when the test happens to
// call nextMessage() — exactly the guarantee a test needs.
// =============================================================================

interface SocketState {
  queue: unknown[];
  waiters: Array<(msg: unknown) => void>;
}

const registry = new WeakMap<WebSocket, SocketState>();

/** Opens a WS connection and resolves once it's open. Starts queuing every
 *  incoming message from the moment the socket is created — not from when
 *  the caller gets around to awaiting it. */
export function connectSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const state: SocketState = { queue: [], waiters: [] };
    registry.set(socket, state);

    // Registered synchronously, before 'open' — this is what closes the race.
    socket.on('message', (data: Buffer) => {
      const parsed = JSON.parse(data.toString());
      const waiter = state.waiters.shift();
      if (waiter) {
        waiter(parsed);
      } else {
        state.queue.push(parsed);
      }
    });

    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

/** Resolves with the next message for this socket — either one that's
 *  already queued, or the next one to arrive. */
export function nextMessage(socket: WebSocket, timeoutMs = 2000): Promise<unknown> {
  const state = registry.get(socket);
  if (!state) {
    throw new Error('nextMessage() requires a socket created via connectSocket()');
  }

  if (state.queue.length > 0) {
    return Promise.resolve(state.queue.shift());
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.waiters = state.waiters.filter((w) => w !== waiter);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for a WebSocket message`));
    }, timeoutMs);

    const waiter = (msg: unknown) => {
      clearTimeout(timer);
      resolve(msg);
    };

    state.waiters.push(waiter);
  });
}

/** Waits briefly and asserts NO message arrived (and none was already
 *  sitting unread in the queue). */
export function expectNoMessage(socket: WebSocket, waitMs = 300): Promise<void> {
  const state = registry.get(socket);
  if (!state) {
    throw new Error('expectNoMessage() requires a socket created via connectSocket()');
  }

  if (state.queue.length > 0) {
    return Promise.reject(
      new Error(`Expected no message, but one was already queued: ${JSON.stringify(state.queue[0])}`),
    );
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.waiters = state.waiters.filter((w) => w !== waiter);
      resolve();
    }, waitMs);

    const waiter = (msg: unknown) => {
      clearTimeout(timer);
      reject(new Error(`Expected no message, but received: ${JSON.stringify(msg)}`));
    };

    state.waiters.push(waiter);
  });
}
