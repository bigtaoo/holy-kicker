// Steering by a hovering mouse: on a desktop the hero walks toward the pointer while it rests over
// the play area, no button held, so a player who never finds the keys or the drag still moves.
// Keys and the drag stick win; hover yields to them and only comes back once the mouse moves
// again, so a keyboard player who lets go of the keys stands still instead of walking off to
// wherever the mouse was left. Pure: the platform feeds the mouse in screen units, the run asks
// for the movement vector in world units.

import type { Vec2 } from './dragStick';

/** World units around the hero where the pointer stops him (the hero is 120 tall). */
export const HOVER_DEAD = 50;
/** World units from the hero at which he walks at full speed; slower in between. */
export const HOVER_FULL = 220;

/** The mouse over the canvas, in app.screen units, while it may steer. */
export class HoverPointer {
  private at: Vec2 | null = null;
  private armed = false;

  /** The mouse moved over the canvas with no button held. */
  move(x: number, y: number): void {
    this.at = { x, y };
    this.armed = true;
  }

  /** The mouse left the canvas, or the window lost the focus. */
  leave(): void {
    this.at = null;
    this.armed = false;
  }

  /** Another source steers (keys, the drag, a click): hover waits for the mouse to move again. */
  quiet(): void {
    this.armed = false;
  }

  /** Where the pointer steers toward, or null when it does not. */
  read(): Vec2 | null {
    return this.armed ? this.at : null;
  }
}

/** The movement toward `pointer` for a hero at `hero` (both in world units), length in [0, 1]. */
export function hoverMove(pointer: Vec2, hero: Vec2, dead = HOVER_DEAD, full = HOVER_FULL): Vec2 {
  const dx = pointer.x - hero.x;
  const dy = pointer.y - hero.y;
  const len = Math.hypot(dx, dy);
  if (len <= dead) return { x: 0, y: 0 };
  // ramps from a slow walk at the edge of the dead zone, so the hero eases onto the pointer
  const mag = Math.min(1, 0.25 + (0.75 * (len - dead)) / (full - dead));
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

/** Whether a vector asks to move at all. */
function moving(v: Vec2): boolean {
  return v.x !== 0 || v.y !== 0;
}

/**
 * The run's movement from its sources: the drag stick while a finger or button is down, else the
 * keys, else the hovering mouse (`hover` maps its screen point to the move, null when the run
 * cannot place it). Quiets the hover whenever the stick or the keys take over.
 */
export function steer(stickHeld: boolean, stick: Vec2, keys: Vec2, pointer: HoverPointer | undefined, hover: (at: Vec2) => Vec2 | null): Vec2 {
  if (stickHeld || moving(keys)) {
    pointer?.quiet();
    return { x: stick.x + keys.x, y: stick.y + keys.y };
  }
  const at = pointer?.read();
  return (at && hover(at)) || { x: 0, y: 0 };
}
