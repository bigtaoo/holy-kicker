// Floating virtual joystick: the stick centre is wherever the finger went down.
// Pure logic in screen pixels, fed by each platform's pointer/touch events.

export interface Vec2 {
  x: number;
  y: number;
}

export class DragStick {
  private id: number | null = null;
  private ox = 0;
  private oy = 0;
  private vec: Vec2 = { x: 0, y: 0 };

  constructor(
    private readonly radius = 70,
    private readonly deadZone = 0.12,
  ) {}

  down(id: number, x: number, y: number): void {
    if (this.id !== null) return;
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
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.vec = { x: dx, y: dy };
  }

  up(id: number): void {
    if (id !== this.id) return;
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
