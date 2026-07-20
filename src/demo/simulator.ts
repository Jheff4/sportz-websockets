// =============================================================================
// demo/simulator.ts — in-process live broadcast simulator (DEMO_MODE)
// =============================================================================
//
// Keeps the DEPLOYED app visibly "live" for any visitor, with no external
// producer. When DEMO_MODE=true, index.ts starts this on boot. It keeps a small
// set of LIVE matches across different sports, and on an interval produces
// realistic events using per-sport playbooks (see ./playbooks):
//   • scores obey each sport's rules (football +1, basketball +2/+3, …)
//   • commentary names real players
//   • at "full time" (a realistic score ceiling) a match finishes and a fresh
//     fixture kicks off — so scores never climb into nonsense over a long run.
//
// WHY in-process (not scripts/stream.ts): writes to the DB directly and calls
// the broadcast functions directly — no HTTP hop, so no Arcjet to fight.
//
// Housekeeping: commentary is pruned per match (KEEP_COMMENTARY) and finished
// matches are trimmed (KEEP_FINISHED, cascade-deletes their commentary), so the
// demo DB stays bounded even though it runs forever.
// =============================================================================

import { eq, desc, and, lt, inArray } from 'drizzle-orm';
import { db } from '../db/db.js';
import { matches, commentary, type Match, type Commentary } from '../db/schema.js';
import { logger } from '../utils/logger.js';
import { PLAYBOOKS, FIXTURES, type Fixture, type Team, type ScoreKind } from './playbooks.js';

interface SimulatorDeps {
  broadcastMatchCreated: (match: Match) => void;
  broadcastCommentary: (matchId: number, comment: Commentary) => void;
  broadcastScoreUpdate: (match: Match) => void;
}

const TICK_MS = Number(process.env.DEMO_TICK_MS ?? 4000);
const LIVE_COUNT = 3; // how many matches are live at once
const KEEP_COMMENTARY = 50; // commentary rows retained per match
const KEEP_FINISHED = 8; // finished matches retained (older ones + their commentary are deleted)

interface LiveState {
  match: Match;
  fixture: Fixture;
  seq: number;
  lastMessage: string;
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template: string, player: string, team: string): string {
  return template.replaceAll('{player}', player).replaceAll('{team}', team);
}

// Build a message from a random template + random player, avoiding an exact
// repeat of the previous line (so the same event type firing twice in a row
// doesn't produce identical commentary).
function pickMessage(templates: string[], team: Team, avoid: string): string {
  let message = '';
  for (let i = 0; i < 5; i++) {
    message = fill(rand(templates), rand(team.players), team.name);
    if (message !== avoid) break;
  }
  return message;
}

// Weighted pick over a sport's scoring options (e.g. basketball 2s > 3s > 1s).
function weightedScore(table: ScoreKind[]): ScoreKind {
  const total = table.reduce((sum, k) => sum + k.weight, 0);
  let r = Math.random() * total;
  for (const kind of table) {
    if ((r -= kind.weight) <= 0) return kind;
  }
  return table[table.length - 1];
}

export function startDemoSimulator(deps: SimulatorDeps): { stop: () => void } {
  const live: LiveState[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  async function createMatch(fixture: Fixture): Promise<LiveState> {
    const now = Date.now();
    const [created] = await db
      .insert(matches)
      .values({
        sport: fixture.sport,
        homeTeam: fixture.home.name,
        awayTeam: fixture.away.name,
        startTime: new Date(now - 5 * 60_000),
        endTime: new Date(now + 90 * 60_000),
        status: 'live',
        homeScore: 0,
        awayScore: 0,
      })
      .returning();
    deps.broadcastMatchCreated(created);
    return { match: created, fixture, seq: 0, lastMessage: '' };
  }

  // Prefer a fixture that isn't already live, for variety.
  function nextFixture(): Fixture {
    const liveKeys = new Set(live.map((l) => l.fixture.home.name + l.fixture.away.name));
    const free = FIXTURES.filter((f) => !liveKeys.has(f.home.name + f.away.name));
    return rand(free.length ? free : FIXTURES);
  }

  async function pruneCommentary(state: LiveState): Promise<void> {
    const cutoff = state.seq - KEEP_COMMENTARY;
    if (cutoff <= 0) return;
    await db
      .delete(commentary)
      .where(and(eq(commentary.matchId, state.match.id), lt(commentary.sequence, cutoff)));
  }

  async function pruneFinished(): Promise<void> {
    const finished = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.status, 'finished'))
      .orderBy(desc(matches.createdAt));
    const stale = finished.slice(KEEP_FINISHED).map((m) => m.id);
    if (stale.length) await db.delete(matches).where(inArray(matches.id, stale)); // cascade → commentary
  }

  async function finishAndReplace(idx: number): Promise<void> {
    const [finished] = await db
      .update(matches)
      .set({ status: 'finished' })
      .where(eq(matches.id, live[idx].match.id))
      .returning();
    if (finished) deps.broadcastScoreUpdate(finished); // card flips to "Final"
    live[idx] = await createMatch(nextFixture());
    await pruneFinished();
  }

  async function tick(): Promise<void> {
    const idx = Math.floor(Math.random() * live.length);
    const state = live[idx];
    if (!state) return;

    const playbook = PLAYBOOKS[state.fixture.sport];
    state.seq += 1;

    if (Math.random() < playbook.scoreChance) {
      const homeScoring = Math.random() < 0.5;
      const team: Team = homeScoring ? state.fixture.home : state.fixture.away;
      const kind = weightedScore(playbook.scoreTable);

      const homeScore = state.match.homeScore + (homeScoring ? kind.points : 0);
      const awayScore = state.match.awayScore + (homeScoring ? 0 : kind.points);

      const [updated] = await db
        .update(matches)
        .set({ homeScore, awayScore })
        .where(eq(matches.id, state.match.id))
        .returning();
      if (updated) {
        state.match = updated;
        deps.broadcastScoreUpdate(updated);
      }

      const message = pickMessage(kind.templates, team, state.lastMessage);
      state.lastMessage = message;
      const [event] = await db
        .insert(commentary)
        .values({
          matchId: state.match.id,
          sequence: state.seq,
          eventType: kind.eventType,
          team: team.name,
          message,
        })
        .returning();
      if (event) deps.broadcastCommentary(state.match.id, event);

      // Full time at a realistic ceiling → finish this match, start a fresh one.
      if (Math.max(state.match.homeScore, state.match.awayScore) >= playbook.maxScore) {
        await finishAndReplace(idx);
        return;
      }
    } else {
      const team: Team = Math.random() < 0.5 ? state.fixture.home : state.fixture.away;
      const kind = rand(playbook.chatter);
      const message = pickMessage(kind.templates, team, state.lastMessage);
      state.lastMessage = message;
      const [event] = await db
        .insert(commentary)
        .values({
          matchId: state.match.id,
          sequence: state.seq,
          eventType: kind.eventType,
          team: team.name,
          message,
        })
        .returning();
      if (event) deps.broadcastCommentary(state.match.id, event);
    }

    if (state.seq % 25 === 0) await pruneCommentary(state);
  }

  async function seed(): Promise<void> {
    // Retire any matches left "live" by a previous run so they show as results,
    // then start a fresh set. (Only happens on restart/deploy.)
    await db.update(matches).set({ status: 'finished' }).where(eq(matches.status, 'live'));
    for (let i = 0; i < LIVE_COUNT; i++) {
      live.push(await createMatch(nextFixture()));
    }
    await pruneFinished();
  }

  seed()
    .then(() => {
      timer = setInterval(() => {
        tick().catch((e) => logger.error('demo tick failed', { error: e }));
      }, TICK_MS);
      logger.info(`DEMO_MODE: simulator running (${live.length} live matches, every ${TICK_MS}ms)`);
    })
    .catch((e) => logger.error('DEMO_MODE: simulator failed to start', { error: e }));

  return {
    stop: () => {
      if (timer) clearInterval(timer);
    },
  };
}
