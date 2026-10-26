import type { UiFrame } from './uiLayout';

// Where the run's HUD rows sit in a frame. A portrait frame stacks them in the top band: the
// experience bar, the build strip, then the wave counter and the run buttons on their own row, then
// the boss bar. A landscape run's frame (about 3400 units wide) has room to put the wave counter in
// the top left corner and the buttons in the top right, level with the build strip, and the boss
// bar just under it, so the fight keeps more of the screen. Pure, so it is tested without Pixi.

export interface HudRows {
  /** The frame is a landscape run's. */
  wide: boolean;
  /** The wave counter's row, the run buttons' row, and the boss bar's top edge. */
  waveY: number;
  buttonsY: number;
  bossTop: number;
}

/** The portrait rows (bossBar.ts keeps the boss bar's own). */
const TALL = { waveY: 300, buttonsY: 300, bossTop: 550 };
/** Level with the build strip (RunHud's BUILD_Y), the boss bar's name clear under its pips. */
const WIDE = { waveY: 150, buttonsY: 150, bossTop: 330 };

export function isWideFrame(f: Pick<UiFrame, 'w' | 'h'>): boolean {
  return f.w > f.h;
}

export function hudRows(f: Pick<UiFrame, 'w' | 'h'>): HudRows {
  const wide = isWideFrame(f);
  return { wide, ...(wide ? WIDE : TALL) };
}

/** Whether `count` cards `cardW` wide sit in a row: on a landscape frame wide enough for them (a 4:3 tablet's is not). */
export function cardsInRow(f: Pick<UiFrame, 'w' | 'h'>, count: number, cardW: number, gap: number): boolean {
  return isWideFrame(f) && count * (cardW + gap) + gap <= f.w;
}

/**
 * How wide the choice's `count` cards are on frame `f`, `columnH` being what their column needs:
 * `cardW` where the row fits or, on a frame too narrow for it, the column (a 4:3 tablet's 1920
 * tall); on a 16:9 landscape frame, 1440 tall, narrow enough for the row to fit its width.
 */
export function cardWidth(f: Pick<UiFrame, 'w' | 'h'>, count: number, cardW: number, gap: number, columnH: number): number {
  const rowW = count * (cardW + gap) + gap;
  return !isWideFrame(f) || rowW <= f.w || columnH <= f.h ? cardW : Math.floor((f.w - gap) / count - gap);
}

/**
 * The middle of each of `count` cards `cardW` x `cardH` with `gap` between them, the stack's top
 * edge at `top`: down the middle on a portrait frame, in a row on a landscape one that fits it.
 */
export function cardSpots(f: Pick<UiFrame, 'w' | 'h'>, count: number, cardW: number, cardH: number, gap: number, top: number): { x: number; y: number }[] {
  const row = cardsInRow(f, count, cardW, gap);
  return Array.from({ length: count }, (_, i) => row
    ? { x: f.w / 2 + (i - (count - 1) / 2) * (cardW + gap), y: top + cardH / 2 }
    : { x: f.w / 2, y: top + cardH / 2 + i * (cardH + gap) });
}
