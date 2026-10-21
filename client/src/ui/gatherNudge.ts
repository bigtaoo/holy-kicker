// A nudge for a hero who stands still while experience piles up around him: once he has not
// moved for GATHER.still seconds and the gems resting in reach hold at least GATHER.share of
// the next level, the tutorial's line low on the screen says to walk over them, with the way to
// go (gatherDir, the eighth of the circle holding the most) shown as the move hint shows moving:
// the arrow keys on a desktop, a dragging finger on a touch screen. It goes as soon as he moves
// (or the gems are gone), then keeps quiet GATHER.wait seconds, at most GATHER.shows times a
// run. Pure: the run watch feeds it the frame time, whether the hero moves and the experience
// lying in reach as a share of the next level.

export const GATHER = {
  still: 4,
  share: 1,
  /** How far from the hero a resting gem counts, in logical units (about half the screen's height). */
  reach: 900,
  wait: 25,
  shows: 3,
};

export class GatherNudge {
  on = false;
  private still = 0;
  private wait = 0;
  private shows = 0;

  /** Advances by `dt` seconds; `lying` is the resting experience in reach over the next level's. Returns whether the nudge shows. */
  step(dt: number, moving: boolean, lying: number): boolean {
    this.still = moving ? 0 : this.still + dt;
    if (this.on) {
      if (moving || lying <= 0) {
        this.on = false;
        this.wait = GATHER.wait;
      }
      return this.on;
    }
    this.wait = Math.max(0, this.wait - dt);
    if (this.shows < GATHER.shows && this.wait === 0 && this.still >= GATHER.still && lying >= GATHER.share) {
      this.on = true;
      this.shows++;
    }
    return this.on;
  }
}

/** A way to go: an eighth of the circle, 0 to the right and on clockwise (screen y points down), so 2 is down. */
export type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The eighth of the circle around (`x`, `y`) whose gems within `reach` hold the most experience. */
export function gatherDir(gems: readonly { x: number; y: number; value: number }[], x: number, y: number, reach: number): Dir8 {
  const sums = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const g of gems) {
    const dx = g.x - x;
    const dy = g.y - y;
    if (dx * dx + dy * dy > reach * reach) continue;
    sums[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8] += g.value;
  }
  return sums.indexOf(Math.max(...sums)) as Dir8;
}
