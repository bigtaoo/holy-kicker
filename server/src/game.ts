// Which game a request comes from: one backend serves Holy Kicker and its corgi reskin
// (docs/reskin.md), and keeps their numbers and boards apart by this tag. Re-exported by
// protocol.ts. Pure, like the rest of the protocol.

/** The games the backend serves. The first is Holy Kicker itself: data without a `game` (all of it before the corgi) is its. */
export const GAMES = ['monk', 'corgi'] as const;
export type Game = (typeof GAMES)[number];

export function isGame(v: unknown): v is Game {
  return typeof v === 'string' && (GAMES as readonly string[]).includes(v);
}

/** The tag as the server keeps it: none for the first game, so its old data and new stay one. */
export function keptGame(game: Game | undefined): Exclude<Game, 'monk'> | undefined {
  return game === 'monk' ? undefined : game;
}

/** What a board id of `game` ends in: nothing for the first game, `-corgi` for the reskin. */
export function boardSuffix(game: Game | undefined): string {
  const g = keptGame(game);
  return g ? `-${g}` : '';
}

/** The optional suffix in a board id's pattern. */
export const BOARD_SUFFIX = `(-(${GAMES.slice(1).join('|')}))?`;
