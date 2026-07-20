// =============================================================================
// demo/playbooks.ts — per-sport realism for the demo simulator
// =============================================================================
//
// Each sport has real clubs/players and a scoring model that obeys its rules,
// so the demo never produces nonsense like a 27-24 football scoreline:
//   • football   — goals worth 1, low totals
//   • basketball — 2s and 3s (and the odd free throw), high totals
//   • rugby      — penalty 3, try 5, converted try 7
//   • cricket    — runs 1/2/4/6 (a wicket scores 0)
//   • tennis     — games worth 1 (teams ARE the players); a set caps at 6
//
// Each event type has MULTIPLE message templates (picked at random, and the
// simulator avoids repeating the exact same line back-to-back) so distinct
// events don't read as identical. `{player}` is filled with a scorer from the
// relevant team; `{team}` with the team name.
//
// `scoreChance` = probability a given tick is a scoring event (basketball scores
// far more often than football). `maxScore` = the realistic ceiling at which a
// match reaches "full time" and the simulator starts a fresh fixture.
// =============================================================================

export interface Team {
  name: string;
  players: string[];
}

export interface ScoreKind {
  points: number;
  weight: number;
  eventType: string;
  templates: string[];
}

export interface ChatterKind {
  eventType: string;
  templates: string[];
}

export interface Playbook {
  scoreChance: number;
  maxScore: number;
  scoreTable: ScoreKind[];
  chatter: ChatterKind[];
}

export interface Fixture {
  sport: string;
  home: Team;
  away: Team;
}

export const PLAYBOOKS: Record<string, Playbook> = {
  football: {
    scoreChance: 0.13,
    maxScore: 5,
    scoreTable: [
      {
        points: 1,
        weight: 1,
        eventType: 'GOAL',
        templates: [
          'GOAL! {player} finishes clinically for {team}!',
          '{player} buries it — {team} score!',
          'What a strike from {player}! {team} celebrate.',
          '{player} slots it home, {team} are ahead!',
        ],
      },
    ],
    chatter: [
      {
        eventType: 'CORNER',
        templates: ['{player} wins a corner for {team}.', 'Corner to {team} — {player} to swing it in.'],
      },
      {
        eventType: 'FOUL',
        templates: ['Crunching challenge on {player}, free kick {team}.', '{player} is bundled over — {team} free kick.'],
      },
      {
        eventType: 'OFFSIDE',
        templates: ['Flag up — {player} caught marginally offside.', 'Offside against {player}, {team} attack breaks down.'],
      },
      {
        eventType: 'SAVE',
        templates: ['Brilliant save to deny {player}!', 'Huge stop — {player} thought he had scored!'],
      },
      {
        eventType: 'YELLOW_CARD',
        templates: ['{player} goes into the book for a late tackle.', 'Booked — {player} caught the shirt.'],
      },
      {
        eventType: 'BUILD_UP',
        templates: ['{team} patiently working it through midfield.', '{player} turns and drives {team} forward.'],
      },
    ],
  },
  basketball: {
    scoreChance: 0.55,
    maxScore: 118,
    scoreTable: [
      {
        points: 2,
        weight: 60,
        eventType: 'FIELD_GOAL',
        templates: [
          '{player} drives and finishes at the rim — 2 for {team}.',
          '{player} pulls up for the mid-range jumper — good!',
          'Nice feed inside and {player} lays it in for {team}.',
        ],
      },
      {
        points: 3,
        weight: 30,
        eventType: 'THREE_POINTER',
        templates: [
          '{player} drills the three! {team} on fire.',
          'From way downtown — {player} nails it!',
          '{player} steps into the triple, nothing but net!',
        ],
      },
      {
        points: 1,
        weight: 10,
        eventType: 'FREE_THROW',
        templates: ['{player} calmly sinks the free throw.', '{player} knocks down the freebie for {team}.'],
      },
    ],
    chatter: [
      {
        eventType: 'REBOUND',
        templates: ['{player} crashes the boards for {team}.', '{player} rips down the rebound and outlets.'],
      },
      {
        eventType: 'STEAL',
        templates: ['{player} picks the pocket and springs a fast break!', '{player} jumps the passing lane — steal for {team}!'],
      },
      {
        eventType: 'BLOCK',
        templates: ['Rejected! {player} swats it away.', '{player} meets it at the rim — denied!', 'Not in his house — {player} with the block!'],
      },
      {
        eventType: 'TIMEOUT',
        templates: ['{team} call a timeout to settle things down.', 'Timeout {team} — the coach wants a word.'],
      },
    ],
  },
  rugby: {
    scoreChance: 0.28,
    maxScore: 40,
    scoreTable: [
      {
        points: 5,
        weight: 40,
        eventType: 'TRY',
        templates: ['TRY! {player} crashes over the line for {team}!', '{player} dives in at the corner — try {team}!'],
      },
      {
        points: 3,
        weight: 35,
        eventType: 'PENALTY',
        templates: ['{player} knocks over the penalty for {team}.', '{player} slots three points from the tee.'],
      },
      {
        points: 2,
        weight: 25,
        eventType: 'CONVERSION',
        templates: ['{player} adds the extras with the conversion.', '{player} converts from out wide.'],
      },
    ],
    chatter: [
      { eventType: 'SCRUM', templates: ['Scrum set on halfway, {team} feeding.', '{team} win the scrum against the head.'] },
      { eventType: 'LINEOUT', templates: ['{player} claims the lineout cleanly.', 'Lineout to {team} — {player} leaps highest.'] },
      { eventType: 'RUCK', templates: ['Quick ball at the ruck for {team}.', '{team} recycle sharply at the breakdown.'] },
      { eventType: 'KNOCK_ON', templates: ['Knock-on from {player} — scrum the other way.', '{player} spills it forward under pressure.'] },
    ],
  },
  cricket: {
    scoreChance: 0.6,
    maxScore: 260,
    scoreTable: [
      {
        points: 1,
        weight: 38,
        eventType: 'RUN',
        templates: ['{player} nudges it into the gap for a single.', '{player} works it to leg for one.'],
      },
      {
        points: 4,
        weight: 25,
        eventType: 'FOUR',
        templates: ['FOUR! {player} threads it through the covers.', 'Cracking shot — {player} finds the boundary!'],
      },
      {
        points: 2,
        weight: 14,
        eventType: 'RUNS',
        templates: ['Good running, {player} comes back for two.', '{player} places it into the gap for a couple.'],
      },
      {
        points: 6,
        weight: 15,
        eventType: 'SIX',
        templates: ['SIX! {player} launches it over the ropes!', 'Huge hit from {player} — into the stands!'],
      },
      {
        points: 0,
        weight: 8,
        eventType: 'WICKET',
        templates: ['WICKET! {player} departs — big blow for {team}.', 'Gone! {player} edges it behind.'],
      },
    ],
    chatter: [
      { eventType: 'DOT_BALL', templates: ['Dot ball, tight line from the bowler.', 'Beaten! No run added for {team}.'] },
      { eventType: 'APPEAL', templates: ['Huge appeal for LBW against {player} — not out!', 'Loud shout against {player}... umpire says no.'] },
      { eventType: 'OVER_END', templates: ['End of the over, {team} rotating the strike well.', 'Over complete — {team} ticking along.'] },
    ],
  },
  tennis: {
    scoreChance: 0.32,
    maxScore: 6,
    scoreTable: [
      {
        points: 1,
        weight: 1,
        eventType: 'GAME',
        templates: ['Game {player} — holds serve to love.', 'Game {player}, held comfortably.', '{player} breaks serve!'],
      },
    ],
    chatter: [
      { eventType: 'ACE', templates: ['Ace down the T from {player}!', '{player} fires an ace out wide!'] },
      { eventType: 'RALLY', templates: ['Terrific 20-shot rally, {player} edges it.', 'Brilliant baseline exchange won by {player}.'] },
      { eventType: 'BREAK_POINT', templates: ['Break point for {player}...', '{player} earns a look at the break.'] },
      { eventType: 'DOUBLE_FAULT', templates: ['Double fault from {player} — costly.', '{player} nets the second serve.'] },
    ],
  },
};

// A team's "players" for tennis is just the player themselves.
const t = (name: string): Team => ({ name, players: [name] });

export const FIXTURES: Fixture[] = [
  {
    sport: 'football',
    home: { name: 'Arsenal FC', players: ['Saka', 'Ødegaard', 'Saliba', 'Rice', 'Havertz'] },
    away: { name: 'Manchester City', players: ['Haaland', 'De Bruyne', 'Foden', 'Rodri', 'Silva'] },
  },
  {
    sport: 'football',
    home: { name: 'Real Madrid', players: ['Bellingham', 'Vinícius Jr', 'Rodrygo', 'Valverde', 'Modrić'] },
    away: { name: 'FC Barcelona', players: ['Lewandowski', 'Yamal', 'Pedri', 'Raphinha', 'Gündoğan'] },
  },
  {
    sport: 'basketball',
    home: { name: 'Los Angeles Lakers', players: ['LeBron James', 'Anthony Davis', 'Austin Reaves'] },
    away: { name: 'Boston Celtics', players: ['Jayson Tatum', 'Jaylen Brown', 'Derrick White'] },
  },
  {
    sport: 'basketball',
    home: { name: 'Golden State Warriors', players: ['Stephen Curry', 'Klay Thompson', 'Draymond Green'] },
    away: { name: 'Denver Nuggets', players: ['Nikola Jokić', 'Jamal Murray', 'Aaron Gordon'] },
  },
  {
    sport: 'cricket',
    home: { name: 'India', players: ['Kohli', 'Rohit Sharma', 'KL Rahul', 'Jadeja'] },
    away: { name: 'Australia', players: ['Smith', 'Labuschagne', 'Warner', 'Cummins'] },
  },
  {
    sport: 'rugby',
    home: { name: 'New Zealand', players: ['Beauden Barrett', 'Ardie Savea', 'Aaron Smith'] },
    away: { name: 'South Africa', players: ['Siya Kolisi', 'Cheslin Kolbe', 'Handré Pollard'] },
  },
  { sport: 'tennis', home: t('C. Alcaraz'), away: t('J. Sinner') },
  { sport: 'tennis', home: t('N. Djokovic'), away: t('D. Medvedev') },
];
