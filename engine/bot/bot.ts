import type { Card } from '../content';
import { MAG_FULL, type PlayerCommand } from '../input';
import { dist, dist2, toFp } from '../math/fixed';
import { atan2B, BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import { Prng } from '../math/prng';
import type { Player, SimState } from '../state';

// A bot that plays a chapter for the balance report (bot/balance.ts), and later perhaps a
// demo or a stand-in teammate. It reads the sim state like a player reads the screen and
// answers with ordinary commands, so it changes nothing in the rules. Integer-only like the
// sim, so a bot run is as reproducible as a replay.
//
// Moving: when enemies press close, it steps to the open side (the boss's marked slam circle
// counts most); with nothing pressing, it walks to the nearest gem or stands.
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
const GEM_REACH = toFp(900);
const DIRS = 16;
/** Danger the hero shrugs off: below it he goes for gems or stands and lets the build work. */
const CALM = toFp(120);

/** How bad standing at (x, y) is: every enemy in reach counts, the closer the more. */
function danger(s: SimState, x: number, y: number): number {
  let sum = 0;
  const add = (bx: number, by: number, reach: number, weight: number) => {
    const d = dist(bx - x, by - y);
    if (d < reach) sum += (reach - d) * weight;
  };
  for (const m of s.mobs) add(m.x, m.y, NEAR_MOB, 1);
  if (s.elite) add(s.elite.x, s.elite.y, NEAR_ELITE, 4);
  const b = s.boss;
  if (b && b.phase !== 'down') {
    add(b.x, b.y, NEAR_BOSS, 6);
    if (b.phase === 'windup') add(b.zoneX, b.zoneY, toFp(480), 40);
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
    const here = danger(s, p.x, p.y);
    if (here < CALM) return this.toGem(s, p);
    let best = here * 2;
    let bx = 0;
    let by = 0;
    for (let k = 0; k < DIRS; k++) {
      const a = (k * BRAD_FULL) / DIRS;
      const dx = Math.trunc((cosB(a) * LOOK) / TRIG_ONE);
      const dy = Math.trunc((sinB(a) * LOOK) / TRIG_ONE);
      let d = danger(s, p.x + dx, p.y + dy) + danger(s, p.x + (dx >> 1), p.y + (dy >> 1));
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
    if (c.kind === 'relic') return 70;
    if (c.kind === 'spell') return p.spells.some((sp) => sp.id === c.id) ? 80 : 90;
    return p.passives.some((ps) => ps.id === c.id) ? 50 : 40;
  }
}
