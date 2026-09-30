// Placeholder horde movement: every mob walks toward the target and pushes away from
// its neighbours so the crowd does not collapse into one point.
// O(n^2) separation is fine for the prototype; the real game will use a spatial grid.

export interface Mob {
  x: number;
  y: number;
}

export interface HordeParams {
  speed: number;
  /** Mobs stop pressing in once this close to the target. */
  stopDist: number;
  /** Neighbours closer than this push each other apart. */
  sepRadius: number;
}

export function stepHorde(mobs: Mob[], tx: number, ty: number, dt: number, p: HordeParams): void {
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    let vx = 0;
    let vy = 0;
    const dx = tx - m.x;
    const dy = ty - m.y;
    const d = Math.hypot(dx, dy);
    if (d > p.stopDist) {
      vx = (dx / d) * p.speed;
      vy = (dy / d) * p.speed;
    }
    for (let j = 0; j < mobs.length; j++) {
      if (j === i) continue;
      const ox = m.x - mobs[j].x;
      const oy = m.y - mobs[j].y;
      const od = Math.hypot(ox, oy);
      if (od > 0 && od < p.sepRadius) {
        const push = ((p.sepRadius - od) / p.sepRadius) * p.speed;
        vx += (ox / od) * push;
        vy += (oy / od) * push;
      }
    }
    m.x += vx * dt;
    m.y += vy * dt;
  }
}
