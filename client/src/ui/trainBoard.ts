// The Train tab's board as a path (docs/design.md "Lobby layout"): the line's nodes in rows of
// ten that snake left to right, then right to left, so each node touches the one before it and
// the line reads as one road. The line comes in pages of `size` nodes (the training's valueStep,
// so a page starts where the values grow), or on one page where the screen is tall enough; a
// node's place is counted from its page's first.
// Pure maths, no Pixi.

export const BOARD_COLS = 10;
/** Centre to centre, across and down. */
export const BOARD_STEP = 98;
export const BOARD_ROW = 112;

/**
 * The least spacing down a board is drawn at (a whole line squeezed into a phone's column, under
 * its banner ad): the next node's ring (48) and a neighbour (40) still clear of each other.
 */
export const MIN_ROW = 90;

/** The spacing down for `rows` rows in `room`, up to BOARD_ROW; null when they do not fit at MIN_ROW. */
export function rowFit(room: number, rows: number): number | null {
  const row = Math.min(BOARD_ROW, room / rows);
  return row >= MIN_ROW ? row : null;
}

/** Node n's centre (1-based), x centred on 0 and y from the board's first row top, rows `row` apart. */
export function boardPos(n: number, row = BOARD_ROW): { x: number; y: number } {
  const r = Math.floor((n - 1) / BOARD_COLS);
  const i = (n - 1) % BOARD_COLS;
  const col = r % 2 === 0 ? i : BOARD_COLS - 1 - i;
  return { x: (col - (BOARD_COLS - 1) / 2) * BOARD_STEP, y: r * row + row / 2 };
}

/** The page (0-based) node n (1-based) is on, with `size` nodes a page. */
export function boardPage(n: number, size: number): number {
  return Math.floor((n - 1) / size);
}

/** The first and last node (1-based) of page `page` of a line `nodes` long. */
export function pageRange(page: number, size: number, nodes: number): { first: number; last: number } {
  const first = page * size + 1;
  return { first, last: Math.min(nodes, first + size - 1) };
}

export function pageCount(nodes: number, size: number): number {
  return Math.max(1, Math.ceil(nodes / size));
}

export function boardRows(nodes: number): number {
  return Math.ceil(nodes / BOARD_COLS);
}

/** The next node's ring at `seconds`: a slow breath in scale and alpha, 1.6 s a beat. */
export function ringPulse(seconds: number): { scale: number; alpha: number } {
  const s = (Math.sin((seconds * 2 * Math.PI) / 1.6) + 1) / 2;
  return { scale: 1 + 0.06 * s, alpha: 0.9 - 0.55 * s };
}
