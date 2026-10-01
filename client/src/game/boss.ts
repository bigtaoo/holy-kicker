// The boss's behaviour, free of Pixi: it lumbers after the hero and, once close, winds up a
// two-fisted slam on a marked circle in front of it. The circle is shown for the whole wind-up
// so the hero can step out; after the slam the boss stands winded for a moment.

export type BossPhase = 'walk' | 'windup' | 'recover';

export interface BossParams {
  speed: number;
  /** Stops walking this close to the hero (world units, centre to centre). */
  stopDist: number;
  /** Starts a slam when the hero is within this distance. */
  slamRange: number;
  /** The slam circle's centre lands at most this far in front of the boss. */
  slamReach: number;
  slamRadius: number;
  /** Seconds from the start of the wind-up to the impact (matches boss_tao.json "slam"). */
  windup: number;
  recover: number;
  /** Seconds of walking between slams. */
  cooldown: number;
  hp: number;
}

export const BOSS: BossParams = {
  speed: 95, stopDist: 150, slamRange: 420, slamReach: 200, slamRadius: 260,
  windup: 1.0, recover: 0.6, cooldown: 2.5, hp: 1500,
};

export interface BossState {
  x: number;
  y: number;
  phase: BossPhase;
  /** Seconds into the current phase. */
  t: number;
  cooldown: number;
  /** Centre of the slam circle while winding up. */
  zoneX: number;
  zoneY: number;
  hp: number;
}

export function newBoss(x: number, y: number, p: BossParams = BOSS): BossState {
  return { x, y, phase: 'walk', t: 0, cooldown: p.cooldown, zoneX: x, zoneY: y, hp: p.hp };
}

/** What happened this step: a wind-up began, the slam landed (and whether it hit), or nothing. */
export type BossEvent = 'windup' | 'slam' | 'slamHit' | null;

export function stepBoss(b: BossState, hx: number, hy: number, dt: number, p: BossParams = BOSS): BossEvent {
  b.t += dt;
  const dx = hx - b.x;
  const dy = hy - b.y;
  const d = Math.hypot(dx, dy);
  if (b.phase === 'walk') {
    b.cooldown -= dt;
    if (d > p.stopDist) {
      const step = Math.min(p.speed * dt, d - p.stopDist);
      b.x += (dx / d) * step;
      b.y += (dy / d) * step;
    }
    if (b.cooldown <= 0 && d <= p.slamRange) {
      // aim at the hero, but never further out than the arms reach
      const reach = Math.min(d, p.slamReach);
      b.zoneX = b.x + (d > 0 ? (dx / d) * reach : 0);
      b.zoneY = b.y + (d > 0 ? (dy / d) * reach : 0);
      enter(b, 'windup');
      return 'windup';
    }
    return null;
  }
  if (b.phase === 'windup') {
    if (b.t < p.windup) return null;
    enter(b, 'recover');
    return Math.hypot(hx - b.zoneX, hy - b.zoneY) <= p.slamRadius ? 'slamHit' : 'slam';
  }
  if (b.t >= p.recover) {
    enter(b, 'walk');
    b.cooldown = p.cooldown;
  }
  return null;
}

/** 0 at the start of the wind-up, 1 at the impact. */
export function windupProgress(b: BossState, p: BossParams = BOSS): number {
  return b.phase === 'windup' ? Math.min(1, b.t / p.windup) : 0;
}

/** Takes damage; true when this blow brings it down. */
export function hurtBoss(b: BossState, damage: number): boolean {
  const was = b.hp;
  b.hp = Math.max(0, b.hp - damage);
  return was > 0 && b.hp === 0;
}

function enter(b: BossState, phase: BossPhase): void {
  b.phase = phase;
  b.t = 0;
}
