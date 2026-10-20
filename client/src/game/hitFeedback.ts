import { FP, type SimEvent, type SimState } from '@hk/engine';
import { BALL_LIFT, type Balls } from './ballView';
import type { BossStage } from './bossStage';
import { ELITE_HEIGHT } from './cast';
import type { DamageLayer } from './damageView';
import { nearestElite, type EliteCrowd } from './eliteView';
import { FxHeat, byHeat } from './fxHeat';
import type { FxLayer } from './fxView';
import { MOB_HEIGHT, type HordeView } from './hordeView';
import type { Corpses } from './mobView';
import type { Shake } from './shake';

// What a blow and a kill look like: the impact, the struck mob's flinch and hit-stop, the
// damage number, the camera's punch, the body and its smoke. All of it is scaled by the
// battle's heat (fxHeat.ts), measured here from the ticks' hits and the crowd on screen, so the
// opening's few hits land big and the late game's hundreds stay small. Game.ts feeds it the
// tick's hit and down events and calls tick() after each tick, frame() every frame.

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

export interface HitViews {
  fx: FxLayer;
  damage: DamageLayer;
  shake: Shake;
  horde: HordeView;
  elites: EliteCrowd | null;
  boss: BossStage | null;
  corpses: Corpses;
  balls: Balls;
}

type HitEvent = Extract<SimEvent, { type: 'hit' }>;

export class HitFeedback {
  readonly heat = new FxHeat();
  private hits = 0;
  private kills = 0;
  private dust = 0;

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
  }

  /** Every frame, before the effect layers update: hands them the heat, and the running hero's dust. */
  frame(dt: number, hx: number, hy: number, moving: boolean, facing: number): void {
    const heat = this.heat.value;
    const pool = this.v.fx.pool;
    pool.heat = heat;
    pool.focusX = hx;
    pool.focusY = hy;
    this.v.damage.pool.heat = heat;
    this.v.balls.heat = heat;
    this.dust -= dt;
    if (moving && heat < DUST_HEAT && this.dust <= 0) {
      this.dust = DUST_EVERY;
      pool.dust(hx, hy, facing < 0 ? -1 : 1);
    }
  }
}
