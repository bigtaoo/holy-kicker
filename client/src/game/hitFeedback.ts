import { FP, type RelicId, type SimEvent, type SimState } from '@hk/engine';
import { BALL_LIFT, type Balls } from './ballView';
import type { BeadsView } from './beadsView';
import type { BossStage } from './bossStage';
import type { BowlView } from './bowlView';
import { ELITE_HEIGHT } from './cast';
import type { DamageLayer } from './damageView';
import { nearestElite, type EliteCrowd } from './eliteView';
import { FxHeat, byHeat } from './fxHeat';
import type { FishTaps } from './fishView';
import type { FxLayer } from './fxView';
import { MOB_HEIGHT, type HordeView } from './hordeView';
import type { Corpses } from './mobView';
import { impactPoint, relicSource, type RingAt, type SweepAt } from './relicBlow';
import type { Shake } from './shake';
import type { StaffSwing } from './staffView';

// What a blow and a kill look like: the impact, the struck mob's flinch and hit-stop, the
// damage number, the camera's punch, the body and its smoke. All of it is scaled by the
// battle's heat (fxHeat.ts), measured here from the ticks' hits and the crowd on screen, so the
// opening's few hits land big and the late game's hundreds stay small. Game.ts feeds it the
// tick's hit, sweep and down events and calls tick() after each tick, frame() every frame.
// The other relics' blows (relicBlow.ts) get the ball's burst and punch too, the punch spaced
// out, since a staff sweep or a sound ring lands on many at once and the beads hit all the time.

/** Damage-number keys for elites, by id, clear of the target indices. */
const ELITE_KEY = 1e6;
/** Half the logical screen, world units: mobs within count as on screen. */
const HALF_W = 540;
const HALF_H = 960;
/** Over this heat the struck mob no longer holds still: a crowd of frozen mobs reads as stutter. */
const HOLD_HEAT = 0.5;
/** Camera punch, px, on the hero's ball landing in a quiet battle (none when hot). */
const PUNCH = 2.5;
/** Seconds between dust puffs at the hero's feet while he runs, and the heat over which there is none. */
const DUST_EVERY = 0.12;
const DUST_HEAT = 0.5;
/** World units a relic's burst sits in front of the struck target, and above its feet. */
const IMPACT_BACK = 40;
const IMPACT_LIFT = 45;
/** Real seconds between a relic's punches, and each relic's punch against the ball's. */
const PUNCH_GAP = 0.2;
const RELIC_PUNCH: Record<RelicId, number> = { ball: 1, staff: 1.2, fish: 1, beads: 0.6, bowl: 1 };

export interface HitViews {
  fx: FxLayer;
  damage: DamageLayer;
  shake: Shake;
  horde: HordeView;
  elites: EliteCrowd | null;
  boss: BossStage | null;
  corpses: Corpses;
  balls: Balls;
  staff: StaffSwing;
  fish: FishTaps;
  beads: BeadsView;
  bowls: BowlView;
}

type HitEvent = Extract<SimEvent, { type: 'hit' }>;

export class HitFeedback {
  readonly heat = new FxHeat();
  private hits = 0;
  private kills = 0;
  private dust = 0;
  /** This tick's staff sweep, the rings at the end of the last tick, real seconds to the next relic punch. */
  private sweepAt: SweepAt | null = null;
  private lastRings: RingAt[] = [];
  private punchWait = 0;

  constructor(private readonly v: HitViews) {}

  hit(e: HitEvent, s: SimState): void {
    const { fx, damage, boss, elites, horde, shake } = this.v;
    const heat = this.heat.value;
    this.hits++;
    if (e.ball) {
      const dx = e.x - e.bx;
      const dy = e.y - e.by;
      fx.hit(e.bx / FP, e.by / FP - BALL_LIFT, dx, dy);
      if (heat < HOLD_HEAT) shake.punch(dx, dy, byHeat(heat / HOLD_HEAT, PUNCH, 0));
    } else {
      this.relicHit(e, s, heat);
    }
    const hold = heat < HOLD_HEAT ? undefined : 0;
    const x = e.x / FP;
    const y = e.y / FP;
    if (e.kind === 'boss' && boss && s.boss) {
      damage.spawn(x, y - boss.hit(s.boss) - 10, e.value, e.crit, e.index);
    } else if (e.kind === 'elite') {
      // the elite hit is the one standing nearest the hit (one in front may have fallen since)
      const hit = nearestElite(s.elites, e.x, e.y);
      if (hit) elites?.byId(hit.id)?.mob.flinch(hold);
      damage.spawn(x, y - ELITE_HEIGHT - 10, e.value, e.crit, ELITE_KEY + (hit?.id ?? 0));
    } else {
      horde.at(e.index)?.flinch(hold);
      damage.spawn(x, y - MOB_HEIGHT[s.mobs[e.index]?.kind ?? 'chaser'] - 10, e.value, e.crit);
    }
  }

  /** A hit that is no ball's: when the staff, the fish, the beads or the bowl dealt it, it bursts and punches like the ball's. */
  private relicHit(e: HitEvent, s: SimState, heat: number): void {
    const relic = s.players[0]?.relicId ?? 'ball';
    const src = relicSource(relic, e.x, e.y, s, this.sweepAt, this.lastRings);
    if (!src) return;
    const dx = e.x - src.x;
    const dy = e.y - src.y;
    const at = impactPoint(src, e.x, e.y, IMPACT_BACK);
    this.v.fx.hit(at.x, at.y - IMPACT_LIFT, dx, dy);
    if (heat >= HOLD_HEAT || this.punchWait > 0) return;
    this.punchWait = PUNCH_GAP;
    this.v.shake.punch(dx, dy, byHeat(heat / HOLD_HEAT, PUNCH * RELIC_PUNCH[relic], 0));
  }

  /** The staff landed this tick (before its hits in the tick's events). */
  sweep(e: Extract<SimEvent, { type: 'sweep' }>): void {
    this.sweepAt = { x: e.x, y: e.y, reach: e.reach };
  }

  mobDown(e: Extract<SimEvent, { type: 'mobDown' }>, s: SimState): void {
    const v = this.v.horde.at(e.index);
    if (v) this.v.corpses.spawn(v, e.dx, e.dy);
    this.v.fx.down(e.x / FP, e.y / FP);
    this.kills++;
    if (s.mobs[e.index]?.kind === 'effigy') this.v.horde.tear(e.x / FP, e.y / FP);
  }

  eliteDown(e: Extract<SimEvent, { type: 'eliteDown' }>): void {
    const v = this.v.elites?.byId(e.id);
    if (v) this.v.corpses.spawn(v.mob, 0, -1);
    this.v.fx.down(e.x / FP, e.y / FP);
  }

  /** After each sim tick's events: heat from its hits and the crowd, the shake from its kills. */
  tick(s: SimState): void {
    const p = s.players[0];
    let onScreen = 0;
    for (const m of s.mobs) {
      if (Math.abs(m.x - p.x) < HALF_W * FP && Math.abs(m.y - p.y) < HALF_H * FP) onScreen++;
    }
    this.heat.tick(this.hits, onScreen);
    this.v.shake.kills(this.kills);
    this.hits = this.kills = 0;
    this.sweepAt = null;
    this.lastRings.length = 0;
    for (const { x, y, radius, reach } of s.rings) this.lastRings.push({ x, y, radius, reach });
  }

  /** Every frame, before the effect layers update: hands them the heat, and the running hero's dust. */
  frame(dt: number, hx: number, hy: number, moving: boolean, facing: number): void {
    const heat = this.heat.value;
    const pool = this.v.fx.pool;
    pool.heat = heat;
    pool.focusX = hx;
    pool.focusY = hy;
    this.v.damage.pool.heat = heat;
    this.v.balls.heat = this.v.staff.heat = this.v.fish.heat = this.v.beads.heat = this.v.bowls.heat = heat;
    this.punchWait -= dt;
    this.dust -= dt;
    if (moving && heat < DUST_HEAT && this.dust <= 0) {
      this.dust = DUST_EVERY;
      pool.dust(hx, hy, facing < 0 ? -1 : 1);
    }
  }
}
