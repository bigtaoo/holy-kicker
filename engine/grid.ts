// Spatial hash for neighbour queries over a flat list of points. Rebuilt every frame with a
// counting sort into reused typed arrays, so it allocates nothing once warmed up. Cells are
// hashed into a power-of-two table: no world bounds needed, and a hash collision only adds
// a few extra candidates that the caller's distance test rejects. Integer cells and a fixed
// visiting order, so the sim gets the same neighbours in the same order on every engine.

export interface Point {
  x: number;
  y: number;
}

export class SpatialGrid {
  private mask = 0;
  /** Bucket b holds items[start[b] .. start[b + 1]). */
  private start = new Int32Array(1);
  private cursor = new Int32Array(0);
  private items = new Int32Array(0);
  private cellOf = new Int32Array(0);
  private readonly scan = new Int32Array(9);

  constructor(readonly cell: number) {}

  build(points: readonly Point[]): void {
    const n = points.length;
    let size = 16;
    while (size < n * 2) size *= 2;
    if (this.start.length !== size + 1) {
      this.start = new Int32Array(size + 1);
      this.cursor = new Int32Array(size);
    } else {
      this.start.fill(0);
    }
    if (this.items.length < n) {
      this.items = new Int32Array(n * 2);
      this.cellOf = new Int32Array(n * 2);
    }
    this.mask = size - 1;
    const { start, cursor, items, cellOf } = this;
    const c = this.cell;
    for (let i = 0; i < n; i++) {
      const b = this.bucket(Math.floor(points[i].x / c), Math.floor(points[i].y / c));
      cellOf[i] = b;
      start[b + 1]++;
    }
    for (let b = 0; b < size; b++) start[b + 1] += start[b];
    cursor.set(start.subarray(0, size));
    for (let i = 0; i < n; i++) items[cursor[cellOf[i]]++] = i;
  }

  /**
   * Writes the indices of every point in the 3x3 cells around (x, y) into `out` and
   * returns how many (at most out.length). With cell >= radius that covers every
   * neighbour within radius.
   */
  near(x: number, y: number, out: Int32Array): number {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const { start, items, scan } = this;
    let k = 0;
    let c = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const b = this.bucket(cx + ox, cy + oy);
        scan[c] = b;
        // two cells can share a bucket; visit each bucket once
        let dup = false;
        for (let j = 0; j < c; j++) if (scan[j] === b) dup = true;
        c++;
        if (dup) continue;
        for (let s = start[b], e = start[b + 1]; s < e && k < out.length; s++) out[k++] = items[s];
      }
    }
    return k;
  }

  private bucket(cx: number, cy: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.mask;
  }
}
