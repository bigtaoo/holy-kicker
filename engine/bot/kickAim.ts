import { KICK } from '../kick';
import { dist2 } from '../math/fixed';
import { atan2B, BRAD_FULL, BRAD_HALF } from '../math/trig';
import type { Player } from '../player';
import type { SimState } from '../state';
import { targetAt } from '../systems/combat';
import { kickable } from '../systems/holyKick';

// When the bot spends a full Holy Kick charge (kick.ts): `now` at once, `aim` (a player who
// lines it up) only with enough of the horde in a narrow cone behind the mob it would kick.

export type KickHabit = 'aim' | 'now' | 'never';

/** At least this many mobs within this half-angle of the kick's line, as far as a body flies. */
const CONE_MOBS = 4;
const CONE_HALF = BRAD_FULL / 36;

export function wantsKick(s: SimState, p: Player, habit: KickHabit): boolean {
  if (habit === 'never' || p.charge !== KICK.full) return false;
  const i = kickable(s, p);
  if (i < 0) return false;
  if (habit === 'now') return true;
  const t = s.mobs[i];
  const dir = atan2B(t.y - p.y, t.x - p.x);
  const r2 = KICK.range * KICK.range;
  let n = 0;
  for (let j = 0; j < s.mobs.length; j++) {
    const m = j === i ? null : targetAt(s, j);
    if (!m || dist2(m.x - t.x, m.y - t.y) > r2) continue;
    const off = ((atan2B(m.y - t.y, m.x - t.x) - dir + BRAD_HALF) & (BRAD_FULL - 1)) - BRAD_HALF;
    if (Math.abs(off) <= CONE_HALF && ++n >= CONE_MOBS) return true;
  }
  return false;
}
