// The maths behind a kicked ball's trail and kick flash (ballView.ts), free of Pixi so it is
// tested on its own. A ball's recent drawn positions go into a small ring of timed samples;
// the trail is read back as points at even ages behind the ball, so its length is a time (a
// fixed share of the ball's flight) whatever the frame rate. A ball that is gone stops adding
// samples and its trail shrinks into the point where it vanished. `heat` (0 an empty opening
// screen, 1 a full late-game one) tones both down as the screen fills, never to nothing.

/** Samples closer together than this replace the newest one instead of adding another (s). */
const MIN_GAP = 1 / 120;

export class TrailHistory {
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly ts: Float64Array;
  /** Index of the newest sample. */
  private head = -1;
  private n = 0;

  constructor(private readonly cap = 32) {
    this.xs = new Float64Array(cap);
    this.ys = new Float64Array(cap);
    this.ts = new Float64Array(cap);
  }

  clear(): void {
    this.head = -1;
    this.n = 0;
  }

  get size(): number {
    return this.n;
  }

  /** Time of the newest sample, -Infinity when empty. */
  get newest(): number {
    return this.n > 0 ? this.ts[this.head] : -Infinity;
  }

  /** The ball was at (x, y) at time t (seconds, never earlier than the newest sample). */
  push(x: number, y: number, t: number): void {
    if (this.n > 1 && t - this.ts[(this.head - 1 + this.cap) % this.cap] < MIN_GAP) {
      // too soon after the one before the newest: move the newest instead of adding one
      this.set(this.head, x, y, t);
      return;
    }
    this.head = (this.head + 1) % this.cap;
    if (this.n < this.cap) this.n++;
    this.set(this.head, x, y, t);
  }

  /**
   * Writes up to `count` points as x, y pairs into `out`, at ages 0, len / (count - 1), … len
   * seconds before `now`: an age newer than the newest sample is the newest sample, and the
   * points stop at the oldest (written as the last). Returns how many points were written.
   */
  sample(now: number, len: number, count: number, out: Float64Array): number {
    if (this.n === 0) return 0;
    const cap = this.cap;
    let j = this.head;
    let left = this.n - 1;
    let written = 0;
    for (let k = 0; k < count; k++) {
      const t = now - (count > 1 ? (len * k) / (count - 1) : 0);
      if (t >= this.ts[j] && j === this.head) {
        out[2 * written] = this.xs[j];
        out[2 * written + 1] = this.ys[j];
        written++;
        continue;
      }
      // walk back to the pair of samples around t
      while (left > 0 && this.ts[(j - 1 + cap) % cap] > t) {
        j = (j - 1 + cap) % cap;
        left--;
      }
      if (left === 0) {
        // past the oldest sample: the trail ends there
        out[2 * written] = this.xs[j];
        out[2 * written + 1] = this.ys[j];
        written++;
        break;
      }
      const i = (j - 1 + cap) % cap;
      const span = this.ts[j] - this.ts[i];
      const f = span > 0 ? (t - this.ts[i]) / span : 1;
      out[2 * written] = this.xs[i] + (this.xs[j] - this.xs[i]) * f;
      out[2 * written + 1] = this.ys[i] + (this.ys[j] - this.ys[i]) * f;
      written++;
    }
    return written;
  }

  private set(i: number, x: number, y: number, t: number): void {
    this.xs[i] = x;
    this.ys[i] = y;
    this.ts[i] = t;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Length and size of the trail and flash: a touch over full on the empty opening screen, 0.6 late. */
export function heatSize(heat: number): number {
  return 1.15 - 0.55 * clamp01(heat);
}

/** Opacity of the trail and flash: full in the opening, 0.6 late. */
export function heatAlpha(heat: number): number {
  return 1 - 0.4 * clamp01(heat);
}

/** Segment k of n (0 at the ball) thins from 1 to near nothing at the tail. */
export function taper(k: number, n: number): number {
  return n <= 0 ? 0 : 1 - (k + 0.5) / n;
}

/** How far the kick flash has grown at `f` (0..1) of its life: 0.55 → 1.2, fast at first. */
export function flashGrow(f: number): number {
  const g = 1 - clamp01(f);
  return 0.55 + 0.65 * (1 - g * g);
}

/** The kick flash's opacity at `f` of its life: held, then gone. */
export function flashAlpha(f: number): number {
  const c = clamp01(f);
  return 1 - c * c;
}
