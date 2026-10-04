import { BOWL } from '../content';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import type { Bowl, Player, SimState } from '../state';
import { bowlLevel, gainXp } from './build';
import { bossIndex, damage, downMob, kickTarget, MOB_GEM, targetAt } from './combat';

// The alms bowl relic (docs/content.md "Relics"): thrown at a target in reach, it flies its
// reach and comes back to the hero, hitting each enemy it passes once each way, the elite and
// the boss at full relic damage. On the way out it drags mobs it hit along and leaves them at
// the far end, clearing room around the hero. Awakened (Bottomless Bowl) it swallows them
// instead: they go down without a gem and their experience goes straight to the thrower.
// One bowl per hero is in the air; the next throw waits for the catch.

export function bowlInAir(s: SimState, p: Player): boolean {
  return s.bowls.some((b) => b.owner === p.owner);
}

/** The throw leaves the hero's hand at the target (the boss and the elite first), or straight ahead. */
export function throwBowl(s: SimState, p: Player): void {
  const lv = bowlLevel(p);
  const t = kickTarget(s, p, lv.reach);
  const target = t >= 0 ? targetAt(s, t)! : null;
  const dx = target ? target.x - p.x : p.facing;
  const dy = target ? target.y - p.y : 0;
  const d = dist(dx, dy) || 1;
  s.bowls.push({
    id: s.nextId++, owner: p.owner, x: p.x, y: p.y, px: p.x, py: p.y,
    vx: Math.trunc((dx * BOWL.speed) / d), vy: Math.trunc((dy * BOWL.speed) / d),
    travel: lv.reach, back: false, damage: lv.damage, carry: lv.carry, swallow: p.awakened, swallowed: 0, hit: [], carried: [],
  });
}

/** Flies every bowl one tick, drags its catch and hits what it reached; a caught bowl is gone. */
export function bowlSystem(s: SimState, events: SimEvent[]): void {
  let w = 0;
  for (const b of s.bowls) {
    const by = s.players.find((q) => q.owner === b.owner) ?? s.players[0];
    b.px = b.x;
    b.py = b.y;
    if (b.back) {
      const dx = by.x - b.x;
      const dy = by.y - b.y;
      const d = dist(dx, dy);
      if (d <= BOWL.speed + BOWL.catch) continue;
      b.vx = Math.trunc((dx * BOWL.speed) / d);
      b.vy = Math.trunc((dy * BOWL.speed) / d);
    }
    b.x += b.vx;
    b.y += b.vy;
    if (!b.back) drag(s, b);
    hit(s, events, b, by);
    if (!b.back) {
      b.travel -= BOWL.speed;
      if (b.travel <= 0) {
        // the catch stays at the far end and is not hit again on the way back
        b.back = true;
        b.hit = b.carried;
        b.carried = [];
      }
    }
    s.bowls[w++] = b;
  }
  s.bowls.length = w;
}

/** Carried mobs move with the bowl; one that went down (and respawned far away) is let go. */
function drag(s: SimState, b: Bowl): void {
  const hold2 = BOWL.hold * BOWL.hold;
  b.carried = b.carried.filter((i) => {
    const m = s.mobs[i];
    if (!m || dist2(m.x - b.px, m.y - b.py) > hold2) return false;
    m.x += b.vx;
    m.y += b.vy;
    return true;
  });
}

function hit(s: SimState, events: SimEvent[], b: Bowl, by: Player): void {
  const r2 = BOWL.radius * BOWL.radius;
  // gathered first: a mob that goes down respawns elsewhere and must not be hit twice
  const hits: number[] = [];
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (!t || dist2(t.x - b.x, t.y - b.y) > r2 || b.hit.includes(i)) continue;
    b.hit.push(i);
    hits.push(i);
  }
  for (const i of hits) {
    const mob = i < s.mobs.length;
    if (mob && b.swallow && b.swallowed < b.carry) {
      b.swallowed++;
      downMob(s, events, i, by, false);
      gainXp(by, MOB_GEM);
      continue;
    }
    damage(s, events, i, by, null, b.damage, false, b);
    // still in reach: it took the blow without going down, so it comes along
    const m = s.mobs[i];
    if (mob && !b.back && !b.swallow && b.carried.length < b.carry && dist2(m.x - b.x, m.y - b.y) <= r2) b.carried.push(i);
  }
}
