import type { Card, RelicId } from '../content';
import { MAG_FULL, type PlayerCommand } from '../input';
import { dist, dist2, toFp } from '../math/fixed';
import { atan2B, BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import { Prng } from '../math/prng';
import { EMERGE } from '../config';
import { rising, underground, type Elite, type Player, type SimState } from '../state';
import { laneDistance } from '../systems/elite';

// A bot that plays a chapter for the balance report (bot/balance.ts), and later perhaps a
// demo or a stand-in teammate. It reads the sim state like a player reads the screen and
// answers with ordinary commands, so it changes nothing in the rules. Integer-only like the
// sim, so a bot run is as reproducible as a replay.
//
// Moving: when enemies press close, it steps to the open side (the boss's marked slam circle
// the elite's marked charge lane and marked zones count most); with nothing pressing, it walks to the nearest gem or stands. With the staff
// the wooden fish or the prayer beads it goes after the elite and the boss and lets them into the relic's reach
// (it still runs from a slam).
// `skilled` re-decides every tenth of a second, `casual` every 0.4 s and holds the stick in
// between; `still` never moves: the floor of what a build alone survives.

export type BotStyle = 'skilled' | 'casual' | 'still';

/** Ticks between a style's decisions: a skilled player reacts at once, a casual one late. */
const REACTION: Record<BotStyle, number> = { skilled: 3, casual: 12, still: 0 };

/** How far ahead a step is judged, and the reach of each kind of danger. */
const LOOK = toFp(260);
const NEAR_MOB = toFp(300);
const NEAR_ELITE = toFp(450);
const NEAR_BOSS = toFp(500);
/**
 * A close relic lets the big ones come `near`, inside its reach; being further than `chase`
 * from one counts as danger too (the bot goes after it). null: keep away (the cuju).
 */
interface CloseIn {
  near: number;
  chase: number;
}
const CLOSE_IN: Record<RelicId, CloseIn | null> = {
  ball: null,
  staff: { near: toFp(200), chase: toFp(280) },
  fish: { near: toFp(220), chase: toFp(330) },
  beads: { near: toFp(200), chase: toFp(260) },
  bowl: null,
};
/** A bullet's path counts this many ticks ahead, and this far either side of it. */
const BULLET_AHEAD = 30;
const NEAR_BULLET = toFp(130);
/** Keep this much further than its radius from a marked zone. */
const ZONE_MARGIN = toFp(90);
/** Keep this far from a marked charge lane. */
const LANE = toFp(200);
const GEM_REACH = toFp(900);
const DIRS = 16;
/** Danger the hero shrugs off: below it he goes for gems or stands and lets the build work. */
const CALM = toFp(120);

/** How bad standing at (x, y) is: every enemy in reach counts, the closer the more. */
function danger(s: SimState, x: number, y: number, close: CloseIn | null): number {
  let sum = 0;
  const add = (bx: number, by: number, reach: number, weight: number) => {
    const d = dist(bx - x, by - y);
    if (d < reach) sum += (reach - d) * weight;
  };
  const chase = (bx: number, by: number) => {
    const d = dist(bx - x, by - y);
    if (close && d > close.chase) sum += d - close.chase;
  };
  for (const m of s.mobs) {
    // a water ghost's mark counts like a slam circle; one deeper under the ground not at all
    if (!underground(m)) add(m.x, m.y, NEAR_MOB, 1);
    else if (rising(m, EMERGE.warn)) add(m.x, m.y, EMERGE.grab * 3, 20);
  }
  for (const b of s.bullets) {
    // the nearest point of its path ahead
    const vv = b.vx * b.vx + b.vy * b.vy || 1;
    const k = Math.max(0, Math.min(BULLET_AHEAD, Math.trunc(((x - b.x) * b.vx + (y - b.y) * b.vy) / vv)));
    add(b.x + b.vx * k, b.y + b.vy * k, NEAR_BULLET, 8);
  }
  // a marked zone (a toad king's pool) counts like the slam circle
  for (const z of s.zones) add(z.x, z.y, z.radius + ZONE_MARGIN, 40);
  const b = s.boss;
  const boss = b && b.phase !== 'down' ? b : null;
  let near: Elite | null = null;
  for (const e of s.elites) {
    add(e.x, e.y, close ? close.near : NEAR_ELITE, 4);
    // a marked charge lane counts like the slam circle
    const lane = laneDistance(e, x, y);
    if (lane >= 0 && lane < LANE) sum += (LANE - lane) * 40;
    if (!near || dist(e.x - x, e.y - y) < dist(near.x - x, near.y - y)) near = e;
  }
  // a close-in relic goes after the nearest elite
  if (near && !boss) chase(near.x, near.y);
  // the carp under water is nothing to bump into, and its circle once locked counts like the slam's
  if (boss && boss.phase === 'rise') add(boss.zoneX, boss.zoneY, toFp(460), 40);
  else if (boss && boss.phase !== 'dive') {
    add(boss.x, boss.y, close ? close.near : NEAR_BOSS, 6);
    if (boss.phase === 'windup') add(boss.zoneX, boss.zoneY, toFp(480), 40);
    else chase(boss.x, boss.y);
  }
  return sum;
}

export class Bot {
  private readonly rng: Prng;
  private lastDir = -1;
  private nextDir = -1;
  private held: [number, number] = [0, 0];

  constructor(readonly owner: number, readonly style: BotStyle, seed: number) {
    this.rng = new Prng(seed ^ 0x51ed27);
  }

  command(s: SimState): PlayerCommand {
    const p = s.players.find((q) => q.owner === this.owner)!;
    const cmd: PlayerCommand = { owner: this.owner, tick: s.tick + 1, moveBrad: 0, moveMag: 0 };
    if (p.offer.length > 0) {
      cmd.pick = this.choose(p);
      return cmd;
    }
    if (p.dead || this.style === 'still') return cmd;
    if (s.tick % REACTION[this.style] === 0) this.held = this.heading(s, p);
    const [dx, dy] = this.held;
    if (dx !== 0 || dy !== 0) {
      cmd.moveBrad = atan2B(dy, dx) & 65535;
      cmd.moveMag = MAG_FULL;
    }
    return cmd;
  }

  /**
   * Toward the open side: of 16 steps around, the one with least danger along the way (a
   * little in favour of the way it already goes, so it does not dither); with no danger near,
   * toward the nearest gem, or nowhere.
   */
  private heading(s: SimState, p: Player): [number, number] {
    const close = CLOSE_IN[p.relicId];
    const here = danger(s, p.x, p.y, close);
    if (here < CALM) return this.toGem(s, p);
    let best = here * 2;
    let bx = 0;
    let by = 0;
    for (let k = 0; k < DIRS; k++) {
      const a = (k * BRAD_FULL) / DIRS;
      const dx = Math.trunc((cosB(a) * LOOK) / TRIG_ONE);
      const dy = Math.trunc((sinB(a) * LOOK) / TRIG_ONE);
      let d = danger(s, p.x + dx, p.y + dy, close) + danger(s, p.x + (dx >> 1), p.y + (dy >> 1), close);
      if (k === this.lastDir) d -= d >> 3;
      if (d < best) {
        best = d;
        bx = dx;
        by = dy;
        this.nextDir = k;
      }
    }
    this.lastDir = bx === 0 && by === 0 ? -1 : this.nextDir;
    return [bx, by];
  }

  private toGem(s: SimState, p: Player): [number, number] {
    this.lastDir = -1;
    let best = GEM_REACH * GEM_REACH;
    let gx = 0;
    let gy = 0;
    for (const g of s.gems) {
      const d = dist2(g.x - p.x, g.y - p.y);
      if (d < best) {
        best = d;
        gx = g.x - p.x;
        gy = g.y - p.y;
      }
    }
    return [gx, gy];
  }

  /** Spells first while slots are open, then levels on what it has, with a little chance. */
  private choose(p: Player): number {
    let best = 0;
    let bestScore = -1;
    p.offer.forEach((c, i) => {
      const score = this.score(p, c) + this.rng.int(25);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  private score(p: Player, c: Card): number {
    // at a shrine: heal when hurt, else the free pick (the bot never bets)
    if (c.kind === 'shrine') return c.id === 'heal' ? (p.hp * 100 < p.maxHp * 60 ? 100 : 0) : c.id === 'insight' ? 60 : -100;
    if (c.kind === 'evolve') return 120;
    if (c.kind === 'relic') return 70;
    if (c.kind === 'spell') return p.spells.some((sp) => sp.id === c.id) ? 80 : 90;
    return p.passives.some((ps) => ps.id === c.id) ? 50 : 40;
  }
}
