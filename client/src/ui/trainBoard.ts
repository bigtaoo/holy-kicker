// The Train tab's board as a path (docs/design.md "Lobby layout"): the line's nodes in rows of
// ten that snake left to right, then right to left, so each node touches the one before it and
// the line reads as one road. Pure maths, no Pixi.

export const BOARD_COLS = 10;
/** Centre to centre, across and down. */
export const BOARD_STEP = 98;
export const BOARD_ROW = 112;

/** Node n's centre (1-based), x centred on 0 and y from the board's first row top. */
export function boardPos(n: number): { x: number; y: number } {
  const row = Math.floor((n - 1) / BOARD_COLS);
  const i = (n - 1) % BOARD_COLS;
  const col = row % 2 === 0 ? i : BOARD_COLS - 1 - i;
  return { x: (col - (BOARD_COLS - 1) / 2) * BOARD_STEP, y: row * BOARD_ROW + BOARD_ROW / 2 };
}

export function boardRows(nodes: number): number {
  return Math.ceil(nodes / BOARD_COLS);
}

/** The next node's ring at `seconds`: a slow breath in scale and alpha, 1.6 s a beat. */
export function ringPulse(seconds: number): { scale: number; alpha: number } {
  const s = (Math.sin((seconds * 2 * Math.PI) / 1.6) + 1) / 2;
  return { scale: 1 + 0.06 * s, alpha: 0.9 - 0.55 * s };
}
