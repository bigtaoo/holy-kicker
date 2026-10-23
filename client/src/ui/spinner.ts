import { Graphics } from 'pixi.js';

// The waiting mark: a ring with a gap, turned every frame by whoever shows it (spin), for a
// button that waits on the host (the death panel's revive while an ad loads or starts).

/** Turns a second. */
const TURNS = 1.2;

/** A ring of radius `r` in `color`, three quarters drawn, centred on its origin. */
export function spinner(r: number, color: number): Graphics {
  const g = new Graphics();
  g.arc(0, 0, r, 0, Math.PI * 1.5).stroke({ width: r * 0.32, color, cap: 'round' });
  return g;
}

/** Sets `g`'s turn for `clock` seconds. */
export function spin(g: Graphics, clock: number): void {
  g.rotation = (clock * TURNS % 1) * Math.PI * 2;
}
