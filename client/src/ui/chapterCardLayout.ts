// Where the chapter card's lines under the stars go (chapterCard.ts), kept free of Pixi so it is
// tested on its own: a line fit() wrapped is taller than one, so each takes its real height.

/** The status line's (or the stars') bottom, and the ranks button's beside it. */
const STATUS_BOTTOM = 188;
const RANKS_BOTTOM = 200;
/** The room between the ranks button and the first line, and between the last line and the chests. */
const GAP = 10;
/** The chests' top with no line over them. */
export const CHESTS_TOP = 200;

export interface CardLines {
  /** Each line's centre (the labels are anchored in the middle). */
  ys: number[];
  /** The chests' top: under the last line, never higher than with none. */
  chests: number;
}

/** Stacks lines of `heights` under the status, clear of the ranks button when the card has one. */
export function cardLinesLayout(heights: number[], ranks: boolean): CardLines {
  let top = ranks ? RANKS_BOTTOM + GAP : STATUS_BOTTOM;
  const ys = heights.map((h) => {
    const y = top + h / 2;
    top += h;
    return y;
  });
  return { ys, chests: heights.length > 0 ? Math.max(CHESTS_TOP, top + GAP) : CHESTS_TOP };
}
