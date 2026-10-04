import { CARP, EMPOWERED_CARP, HURT } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import type { Boss, Player, SimState } from '../state';
import { ring } from './threats';

// The Black Carp King, chapter 2's boss (docs/content.md "Chapters"): it swims after the hero
// and, every few seconds, dives. Under water it is out of reach and swims after him fast; then
// it locks a circle where he stands and rises under it, the circle filling as it comes. It
// surfaces with a shockwave that hurts him inside and a ring of bullets out from the rim, and
// lies winded a moment, the time to kick it. Empowered (chapter 3's mid-boss), it dives more
// often and its rings are fuller.

/** Moves `b` up to `step` toward (x, y), stopping `stop` short. */
function swimTo(b: Boss, x: number, y: number, step: number, stop: number): void {
  const dx = x - b.x;
  const dy = y - b.y;
  const d = dist(dx, dy);
  if (d <= stop) return;
  const k = Math.min(step, d - stop);
  b.x += Math.trunc((dx * k) / d);
  b.y += Math.trunc((dy * k) / d);
}

/** Steps a carp that is not down; `target` is the nearest player. */
export function stepCarp(s: SimState, b: Boss, target: Player, events: SimEvent[], hurt: (owner: number, value: number) => void): void {
  if (b.phase === 'walk') {
    swimTo(b, target.x, target.y, CARP.speed, CARP.stopDist);
    if (--b.cooldown > 0) return;
    b.phase = 'dive';
    b.t = 0;
    events.push({ type: 'bossDive', x: b.x, y: b.y });
    return;
  }
  if (b.phase === 'dive') {
    swimTo(b, target.x, target.y, CARP.swim, 0);
    if (b.t < CARP.dive) return;
    // the circle locks where the hero stands now
    b.zoneX = target.x;
    b.zoneY = target.y;
    b.phase = 'rise';
    b.t = 0;
    events.push({ type: 'bossWindup' });
    return;
  }
  if (b.phase === 'rise') {
    swimTo(b, b.zoneX, b.zoneY, CARP.swim, 0);
    if (b.t < CARP.rise) return;
    b.x = b.zoneX;
    b.y = b.zoneY;
    b.phase = 'recover';
    b.t = 0;
    events.push({ type: 'bossSlam', x: b.zoneX, y: b.zoneY, radius: CARP.radius });
    const r2 = CARP.radius * CARP.radius;
    for (const p of s.players) if (dist2(p.x - b.zoneX, p.y - b.zoneY) <= r2) hurt(p.owner, HURT.surface);
    ring(s, b.zoneX, b.zoneY, CARP.radius, b.empowered ? EMPOWERED_CARP.ring : CARP.ring, s.tick);
    return;
  }
  if (b.t >= CARP.recover) {
    b.phase = 'walk';
    b.t = 0;
    b.cooldown = b.empowered ? EMPOWERED_CARP.cooldown : CARP.cooldown;
  }
}
