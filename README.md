# Sportz — Real-Time Match Broadcast Engine

A high-performance WebSocket broadcast server built with Node.js and TypeScript. Designed to ingest live match data and deliver ball-by-ball commentary, score updates, and match events to thousands of simultaneous subscribers with sub-second latency.

The companion frontend lives at [sportz-ui](https://github.com/Jheff4/sportz-ui).

---

## Architecture

```
                        ┌─────────────────────────────────────┐
                        │           Express HTTP Server         │
                        │              (port 8000)              │
                        │                                       │
  REST Clients  ──────▶ │  POST /matches                        │
                        │  GET  /matches                        │
                        │  POST /matches/:id/commentary         │──▶ Neon PostgreSQL
                        │  GET  /matches/:id/commentary         │
                        │                                       │
                        │  ┌─────────────────────────────────┐ │
  WS Clients   ──────▶  │  │    WebSocket Server  (/ws)      │ │
                        │  │                                  │ │
                        │  │  subscribe   → match room        │ │
                        │  │  unsubscribe → leave room        │ │
                        │  │                                  │ │
                        │  │  broadcast → match_created       │ │
                        │  │  broadcast → commentary          │ │
                        │  └─────────────────────────────────┘ │
                        └─────────────────────────────────────┘
                                        │
                              Arcjet Security Layer
                         (rate limiting · bot detection · shield)
```

The WebSocket server and REST API share a **single HTTP server instance**. Upgrade requests to `/ws` are intercepted before reaching Express, rate-limited by Arcjet, then handed off to the WebSocket server. All other traffic is handled by Express normally.

---

## Tech Stack

| Layer          | Technology                                    |
| -------------- | --------------------------------------------- |
| Runtime        | Node.js 22, TypeScript 6                      |
| HTTP Framework | Express 5                                     |
| WebSocket      | `ws` — lightweight, no abstraction overhead   |
| Database       | Neon (serverless PostgreSQL)                  |
| ORM            | Drizzle ORM — type-safe, zero overhead        |
| Validation     | Zod 4                                         |
| Security       | Arcjet — rate limiting, bot detection, shield |
| Build          | `tsc` → `dist/`                               |
| Dev Server     | `tsx --watch`                                 |

---

## Project Structure

```
src/
├── db/
│   ├── db.ts              # pg Pool + Drizzle client
│   └── schema.ts          # matches + commentary table definitions
├── routes/
│   ├── matches.ts         # GET / POST /matches
│   └── commentary.ts      # GET / POST /matches/:id/commentary
├── validation/
│   ├── matches.ts         # Zod schemas + inferred types for matches
│   └── commentary.ts      # Zod schemas + inferred types for commentary
├── ws/
│   └── server.ts          # WebSocket server, subscription registry, heartbeat
├── utils/
│   └── match-status.ts    # Derives match status from timestamps
├── arcjet.ts              # Arcjet HTTP + WS protection instances
└── index.ts               # App entry point — wires everything together
```

---

## API Reference

### Matches

#### `GET /matches`

Returns a paginated list of matches ordered by most recently created.

**Query params**

| Param   | Type     | Default | Description         |
| ------- | -------- | ------- | ------------------- |
| `limit` | `number` | `50`    | Max results (1–100) |

**Response `200`**

```json
{
  "data": [
    {
      "id": 1,
      "sport": "football",
      "homeTeam": "Arsenal",
      "awayTeam": "Chelsea",
      "status": "live",
      "startTime": "2026-06-16T15:00:00.000Z",
      "endTime": "2026-06-16T17:00:00.000Z",
      "homeScore": 2,
      "awayScore": 1,
      "createdAt": "2026-06-16T14:55:00.000Z"
    }
  ]
}
```

---

#### `POST /matches`

Creates a new match. Status (`scheduled` | `live` | `finished`) is derived automatically from `startTime` and `endTime` relative to the current time.

Broadcasts a `match_created` event to all connected WebSocket clients.

**Request body**

```json
{
  "sport": "football",
  "homeTeam": "Arsenal",
  "awayTeam": "Chelsea",
  "startTime": "2026-06-16T15:00:00.000Z",
  "endTime": "2026-06-16T17:00:00.000Z",
  "homeScore": 0,
  "awayScore": 0
}
```

**Response `201`**

```json
{ "data": { ...match } }
```

---

### Commentary

#### `GET /matches/:id/commentary`

Returns commentary events for a match, ordered by most recent first.

**Query params**

| Param   | Type     | Default | Description         |
| ------- | -------- | ------- | ------------------- |
| `limit` | `number` | `100`   | Max results (1–100) |

**Response `200`**

```json
{
  "data": [
    {
      "id": 24,
      "matchId": 1,
      "minute": 23,
      "sequence": 24,
      "period": "1st half",
      "eventType": "GOAL",
      "actor": "Bukayo Saka",
      "team": "Arsenal",
      "message": "A composed finish from close range.",
      "metadata": null,
      "tags": ["goal", "first-half"],
      "createdAt": "2026-06-16T15:23:10.000Z"
    }
  ]
}
```

---

#### `POST /matches/:id/commentary`

Inserts a new commentary event for a match and broadcasts it in real time to all WebSocket clients subscribed to that match.

**Request body**

```json
{
  "minute": 23,
  "sequence": 24,
  "period": "1st half",
  "eventType": "GOAL",
  "actor": "Bukayo Saka",
  "team": "Arsenal",
  "message": "A composed finish from close range.",
  "tags": ["goal", "first-half"]
}
```

**Response `201`**

```json
{ "data": { ...commentaryEvent } }
```

---

## WebSocket Protocol

Connect to `ws://localhost:8000/ws`.

### Client → Server messages

#### Subscribe to a match

```json
{ "type": "subscribe", "matchId": 1 }
```

#### Unsubscribe from a match

```json
{ "type": "unsubscribe", "matchId": 1 }
```

### Server → Client messages

| `type`          | Trigger                        | Sent to                        |
| --------------- | ------------------------------ | ------------------------------ |
| `welcome`       | On connection                  | That client only               |
| `subscribed`    | After subscribe                | That client only               |
| `unsubscribed`  | After unsubscribe              | That client only               |
| `match_created` | `POST /matches`                | All connected clients          |
| `commentary`    | `POST /matches/:id/commentary` | Subscribers of that match only |
| `error`         | Invalid JSON received          | That client only               |

#### Example `commentary` event

```json
{
  "type": "commentary",
  "data": {
    "id": 24,
    "matchId": 1,
    "minute": 23,
    "eventType": "GOAL",
    "actor": "Bukayo Saka",
    "message": "A composed finish from close range."
  }
}
```

The server sends a **ping every 30 seconds** and terminates any client that fails to respond with a pong — preventing ghost connections from accumulating.

---

## Database Schema

```
matches
├── id            serial PRIMARY KEY
├── sport         text NOT NULL
├── homeTeam      text NOT NULL
├── awayTeam      text NOT NULL
├── status        match_status ENUM ('scheduled' | 'live' | 'finished')
├── startTime     timestamp NOT NULL
├── endTime       timestamp
├── homeScore     integer DEFAULT 0
├── awayScore     integer DEFAULT 0
└── createdAt     timestamp DEFAULT now()

commentary
├── id            serial PRIMARY KEY
├── matchId       integer → matches.id (CASCADE DELETE)
├── minute        integer
├── sequence      integer NOT NULL
├── period        text
├── eventType     text NOT NULL
├── actor         text
├── team          text
├── message       text NOT NULL
├── metadata      jsonb
├── tags          text[]
└── createdAt     timestamp DEFAULT now()
```

---

## Getting Started

### Prerequisites

- Node.js 22+
- A [Neon](https://neon.tech) database
- An [Arcjet](https://arcjet.com) API key

### 1. Clone and install

```bash
git clone https://github.com/Jheff4/sportz-websockets.git
cd sportz-websockets
npm install
```

### 2. Environment variables

Create a `.env` file at the project root:

```env
# Neon — Project → Dashboard → Connect
DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require&channel_binding=require"

# Arcjet — https://app.arcjet.com
ARCJET_KEY="ajkey_xxx"

# Optional
PORT=8000
HOST=0.0.0.0
ARCJET_MODE=DRY_RUN   # set to LIVE in production
```

### 3. Run database migrations

```bash
npm run db:generate   # generate SQL from schema
npm run db:migrate    # apply to Neon
```

### 4. Start the development server

```bash
npm run dev
```

Server runs at `http://localhost:8000`.  
WebSocket server at `ws://localhost:8000/ws`.

---

## Scripts

| Script                | Description                                |
| --------------------- | ------------------------------------------ |
| `npm run dev`         | Start with hot reload (`tsx --watch`)      |
| `npm run build`       | Compile TypeScript → `dist/`               |
| `npm start`           | Run compiled output (`node dist/index.js`) |
| `npm run db:generate` | Generate Drizzle migration from schema     |
| `npm run db:migrate`  | Apply pending migrations to the database   |

---

## Deployment

```bash
npm run build
npm start
```

The `dist/` directory is the deployable artifact. Set all environment variables on your host and point your process manager at `dist/index.js`.

Recommended platforms: **Railway**, **Fly.io**, **Render**.

---

## Security

All HTTP and WebSocket traffic passes through [Arcjet](https://arcjet.com):

- **Shield** — protects against common web attacks
- **Bot detection** — blocks unwanted automated traffic (search engines and preview bots are allowed)
- **Rate limiting** — sliding window: 50 requests / 10s on HTTP, 5 connections / 2s on WebSocket upgrades

Set `ARCJET_MODE=DRY_RUN` to log decisions without blocking — useful during development.

---

## License

ISC
