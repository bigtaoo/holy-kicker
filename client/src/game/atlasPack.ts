// Grid packing of equal-sized sheets into square atlas pages. Pure, so the stress-test
// layout (and later a real mob atlas) can be checked without Pixi.

export interface Slot {
  page: number;
  x: number;
  y: number;
}

/** Places `count` sheets of w x h on pages of `size` px, row by row. Throws if one does not fit. */
export function gridPack(w: number, h: number, count: number, size: number): Slot[] {
  const cols = Math.floor(size / w);
  const rows = Math.floor(size / h);
  if (cols < 1 || rows < 1) throw new Error(`a ${w}x${h} sheet does not fit a ${size} page`);
  const per = cols * rows;
  return Array.from({ length: count }, (_, i) => ({
    page: Math.floor(i / per),
    x: (i % per % cols) * w,
    y: Math.floor((i % per) / cols) * h,
  }));
}
