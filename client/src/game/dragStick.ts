// Floating virtual joystick: the stick centre is wherever the finger went down.
// Pure logic in screen pixels, fed by each platform's pointer/touch events.

export interface Vec2 {
  x: number;
  y: number;
}

/** A tap is a touch lifted within this many ms. */
export const TAP_MS = 180;

export class DragStick {
  private id: number | null = null;
  private ox = 0;
  private oy = 0;
  private vec: Vec2 = { x: 0, y: 0 };
  /** Fingers put down so far (a new tap shows as a change). */
  presses = 0;
  /** Quick taps so far: down and up within TAP_MS, never out of the dead zone (the Holy Kick). */
  taps = 0;
  private downAt = 0;
  private moved = false;

  constructor(
    private readonly radius = 70,
    private readonly deadZone = 0.12,
    private readonly now: () => number = () => performance.now(),
  ) {}

  down(id: number, x: number, y: number): void {
    if (this.id !== null) return;
    this.presses++;
    this.downAt = this.now();
    this.moved = false;
    this.id = id;
    this.ox = x;
    this.oy = y;
    this.vec = { x: 0, y: 0 };
  }

  move(id: number, x: number, y: number): void {
    if (id !== this.id) return;
    let dx = (x - this.ox) / this.radius;
    let dy = (y - this.oy) / this.radius;
    const len = Math.hypot(dx, dy);
    if (len < this.deadZone) {
      this.vec = { x: 0, y: 0 };
      return;
    }
    this.moved = true;
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.vec = { x: dx, y: dy };
  }

  up(id: number): void {
    if (id !== this.id) return;
    if (!this.moved && this.now() - this.downAt < TAP_MS) this.taps++;
    this.id = null;
    this.vec = { x: 0, y: 0 };
  }

  /** Movement vector with length in [0, 1]. */
  read(): Vec2 {
    return this.vec;
  }

  /** Stick centre while a finger is down, for drawing the stick. */
  origin(): Vec2 | null {
    return this.id === null ? null : { x: this.ox, y: this.oy };
  }
}
