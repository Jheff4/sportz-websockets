import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const matchStatusEnum = pgEnum('match_status', [
  'scheduled',
  'live',
  'finished',
]);

// ─── Matches ──────────────────────────────────────────────────────────────────

export const matches = pgTable('matches', {
  id:        serial('id').primaryKey(),
  sport:     text('sport').notNull(),
  homeTeam:  text('home_team').notNull(),
  awayTeam:  text('away_team').notNull(),
  status:    matchStatusEnum('status').default('scheduled').notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime:   timestamp('end_time'),
  homeScore: integer('home_score').default(0).notNull(),
  awayScore: integer('away_score').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Commentary ───────────────────────────────────────────────────────────────

export const commentary = pgTable('commentary', {
  id:        serial('id').primaryKey(),
  matchId:   integer('match_id')
               .references(() => matches.id, { onDelete: 'cascade' })
               .notNull(),
  minute:    integer('minute'),
  sequence:  integer('sequence').notNull(),
  period:    text('period'),
  eventType: text('event_type').notNull(),
  actor:     text('actor'),
  team:      text('team'),
  message:   text('message').notNull(),
  metadata:  jsonb('metadata'),
  tags:      text('tags').array(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type Match    = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;

export type Commentary    = typeof commentary.$inferSelect;
export type NewCommentary = typeof commentary.$inferInsert;
