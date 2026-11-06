// Where the results screen's parts go in a landscape frame (ResultsScreen.ts): one panel in the
// middle with two columns, the run on the left (the header, what felled the hero, the next step)
// and what it brought on the right (the rewards, the unlocks, the news, the chapter opened), the
// buttons in one row along the panel's foot. Pure, so it is tested without Pixi.

/** The space between a column's parts. */
export const WIDE_GAP = 30;
/** The panel's padding round and between its columns. */
export const WIDE_PAD = 70;
/** The button row's band at the panel's foot, under its rule. */
export const WIDE_ROW_H = 190;

export interface WidePlan {
  /** The panel's size; its centre is the origin of every position here. */
  w: number;
  h: number;
  /** Each column's centre. */
  leftX: number;
  rightX: number;
  /** Each part's top, in each column's order. */
  left: number[];
  right: number[];
  /** The rule over the buttons and the buttons' centre. */
  ruleY: number;
  rowY: number;
  /** The columns' band, for the rule between them. */
  top: number;
  bottom: number;
}

/** Tops for parts `heights` tall, `gap` apart, the stack centred in a band `band` tall from `top`. */
function stack(heights: readonly number[], top: number, band: number): number[] {
  const total = heights.reduce((n, h) => n + h, 0) + WIDE_GAP * Math.max(0, heights.length - 1);
  let y = top + (band - total) / 2;
  return heights.map((h) => {
    const at = y;
    y += h + WIDE_GAP;
    return at;
  });
}

/** The panel for two columns `colW` wide holding parts `left` and `right` tall, the button row under them. */
export function widePlan(colW: number, left: readonly number[], right: readonly number[]): WidePlan {
  const tall = (hs: readonly number[]) => hs.reduce((n, h) => n + h, 0) + WIDE_GAP * Math.max(0, hs.length - 1);
  const band = Math.max(tall(left), tall(right));
  const w = 2 * colW + 3 * WIDE_PAD;
  const h = WIDE_PAD + band + WIDE_PAD / 2 + WIDE_ROW_H;
  const top = -h / 2 + WIDE_PAD;
  const ruleY = top + band + WIDE_PAD / 2;
  return {
    w,
    h,
    leftX: -(colW + WIDE_PAD) / 2,
    rightX: (colW + WIDE_PAD) / 2,
    left: stack(left, top, band),
    right: stack(right, top, band),
    ruleY,
    rowY: ruleY + WIDE_ROW_H / 2,
    top,
    bottom: top + band,
  };
}

/** Centres for buttons `widths` wide in one row `gap` apart, the row centred on 0. */
export function rowCentres(widths: readonly number[], gap: number): number[] {
  const total = widths.reduce((n, w) => n + w, 0) + gap * Math.max(0, widths.length - 1);
  let x = -total / 2;
  return widths.map((w) => {
    const at = x + w / 2;
    x += w + gap;
    return at;
  });
}

/** How far a panel `w` by `h` shrinks to fit a frame `fw` by `fh` with `margin` round it; never grows. */
export function fitScale(w: number, h: number, fw: number, fh: number, margin: number): number {
  return Math.min(1, (fw - 2 * margin) / w, (fh - 2 * margin) / h);
}
