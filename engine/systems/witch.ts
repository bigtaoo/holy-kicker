import { EMPOWERED_WITCH, WITCH } from '../config';
import type { SimEvent } from '../events';
import { dist } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Boss, Player, SimState } from '../state';
import { standing } from './ghost';
import { fan } from './threats';

// The Bone Witch, chapter 3's boss (docs/content.md "Chapters"): she keeps her distance from
// the hero and, every few seconds, raises her staff; then in turn she calls skeletons up out of
// the ground around her (they split into bone crawlers when they fall, systems/snow.ts) or
// throws a wide fan of bone bullets at him. A full guard of skeletons and she throws instead.
// Empowered (chapter 4's mid-boss) she rests less, keeps a bigger guard and throws wider.

/** Steps a witch that is not down; `target` is the nearest player. */
export function stepWitch(s: SimState, b: Boss, target: Player, events: SimEvent[]): void {
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const d = dist(dx, dy);
  if (b.phase === 'walk') {
    if (d > WITCH.stopDist) {
      const step = Math.min(WITCH.speed, d - WITCH.stopDist);
      b.x += Math.trunc((dx * step) / d);
      b.y += Math.trunc((dy * step) / d);
    }
    if (--b.cooldown > 0 || target.dead || d > WITCH.range) return;
    b.phase = 'windup';
    b.t = 0;
    events.push({ type: 'bossWindup' });
    return;
  }
  if (b.phase === 'windup') {
    if (b.t < WITCH.windup) return;
    b.phase = 'recover';
    b.t = 0;
    const k = b.empowered ? EMPOWERED_WITCH : WITCH;
    const room = k.maxSkeletons - standing(s, 'skeleton');
    if (b.shots++ % 2 === 0 && room > 0) summon(s, b, Math.min(k.summon, room), events);
    else fan(s, b.x, b.y, target.x, target.y, k.fan);
    events.push({ type: 'bossCast', x: b.x, y: b.y });
    return;
  }
  if (b.t >= WITCH.recover) {
    b.phase = 'walk';
    b.t = 0;
    b.cooldown = b.empowered ? EMPOWERED_WITCH.cooldown : WITCH.cooldown;
  }
}

/** `n` skeletons rise around the witch, evenly spread from a random start. */
function summon(s: SimState, b: Boss, n: number, events: SimEvent[]): void {
  const a0 = s.ai.int(65536);
  for (let k = 0; k < n; k++) {
    const a = (a0 + Math.trunc((k * 65536) / n)) & 65535;
    const r = s.ai.range(WITCH.near, WITCH.far);
    const x = b.x + Math.trunc((cosB(a) * r) / TRIG_ONE);
    const y = b.y + Math.trunc((sinB(a) * r) / TRIG_ONE);
    s.spawns.push({ kind: 'skeleton', x, y });
    events.push({ type: 'summon', x, y });
  }
}
