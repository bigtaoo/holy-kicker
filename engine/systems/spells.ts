import { SPELLS } from '../config';
import type { SimEvent } from '../events';
import { dist2, TICK_RATE, toFp } from '../math/fixed';
import type { Player, SimState } from '../state';
import { bossIndex, damage, targetAt } from './combat';

// Area spells for the stress test: cast round-robin around the first player at the run's
// rate, killing every target they reach, so the cost of big spells and of the per-kill effects
// they trigger can be measured together.

/** Bolts leave the caster's chest and land on the target's body. */
const CHEST = toFp(60);
const BODY = toFp(50);

/** Damages every target within r of (x, y). */
function area(s: SimState, events: SimEvent[], by: Player, x: number, y: number, r: number): void {
  const r2 = r * r;
  const n = bossIndex(s);
  for (let i = 0; i <= n; i++) {
    const t = targetAt(s, i);
    if (t && dist2(t.x - x, t.y - y) < r2) damage(s, events, i, by, null);
  }
}

function near(s: SimState, p: Player, spread: number): [number, number] {
  return [p.x + s.spell.range(-spread, spread), p.y + s.spell.range(-spread, spread)];
}

export function spellSystem(s: SimState, events: SimEvent[]): void {
  const c = s.config;
  const p = s.players[0];
  if (c.spells.length > 0 && --s.spellT <= 0) {
    s.spellT = Math.max(1, Math.round(TICK_RATE / c.spellRate));
    const kind = c.spells[s.spellNext++ % c.spells.length];
    if (kind === 'nova') {
      events.push({ type: 'cast', kind, x: p.x, y: p.y, radius: SPELLS.novaRadius });
      area(s, events, p, p.x, p.y, SPELLS.novaRadius);
    } else if (kind === 'meteor') {
      for (let i = 0; i < SPELLS.meteors; i++) {
        const [x, y] = near(s, p, SPELLS.meteorSpread);
        events.push({ type: 'cast', kind, x, y, radius: SPELLS.meteorRadius });
        area(s, events, p, x, y, SPELLS.meteorRadius);
      }
    } else if (kind === 'field') {
      const [x, y] = near(s, p, SPELLS.fieldSpread);
      s.fields.push({ id: s.nextId++, x, y, age: 0, next: 0 });
      events.push({ type: 'cast', kind, x, y, radius: SPELLS.fieldRadius });
    } else {
      chain(s, events, p);
    }
  }
  let w = 0;
  for (const f of s.fields) {
    f.age++;
    if (--f.next <= 0) {
      f.next = SPELLS.fieldTick;
      area(s, events, p, f.x, f.y, SPELLS.fieldRadius);
    }
    if (f.age < SPELLS.fieldLife) s.fields[w++] = f;
  }
  s.fields.length = w;
}

/** Lightning from the player's chest jumping from target to target, never one twice. */
function chain(s: SimState, events: SimEvent[], p: Player): void {
  let x = p.x;
  let y = p.y - CHEST;
  const hit: number[] = [];
  for (let j = 0; j < SPELLS.chainJumps; j++) {
    const range = j === 0 ? SPELLS.chainRange * 2 : SPELLS.chainRange;
    let best = -1;
    let bestD = range * range;
    const n = bossIndex(s);
    for (let i = 0; i <= n; i++) {
      const t = hit.includes(i) ? null : targetAt(s, i);
      if (!t) continue;
      const d = dist2(t.x - x, t.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    hit.push(best);
    const t = targetAt(s, best)!;
    const tx = t.x;
    const ty = t.y - BODY;
    events.push({ type: 'bolt', x0: x, y0: y, x1: tx, y1: ty });
    damage(s, events, best, p, null);
    x = tx;
    y = ty;
  }
}
