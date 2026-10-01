import { BOSS, HORDE, SHRINE, WAVES } from '../config';
import type { SimEvent } from '../events';
import { body, newElite, newMob, type SimState } from '../state';
import { newBoss } from './boss';
import { openShrine, payBet } from './build';
import { ringPoint } from './horde';

// The chapter's waves (docs/design.md "Chapters"): each lasts WAVES.ticks; the horde grows
// at the start of every wave, an elite comes every tenth wave, and the boss waves (the
// mid-boss and the last) last until their boss falls. The chapter boss falling wins the run;
// every hero down loses it until a revive. Shrine waves open with the shrine cards. The
// sandbox (config.waves 0) skips all of this.

export function hordeSize(wave: number): number {
  return Math.min(WAVES.hordeMax, WAVES.hordeBase + WAVES.hordeStep * (wave - 1));
}

/** Health of a mob that joins or comes back on wave `wave`; the sandbox (wave 0) horde has 1. */
export function mobHp(wave: number): number {
  const n = wave - 1;
  return wave > 0 ? HORDE.hp + Math.trunc((HORDE.hpStep * n + HORDE.hpSquare * n * n) / 1000) : 1;
}

export function isBossWave(wave: number, last: number): boolean {
  return wave === last || (wave === WAVES.midBoss && wave < last);
}

/** Shrine waves open with the shrine cards (never the last wave). */
export function isShrineWave(wave: number, last: number): boolean {
  return wave >= SHRINE.first && (wave - SHRINE.first) % SHRINE.every === 0 && wave < last;
}

export function isEliteWave(wave: number, last: number): boolean {
  return wave % WAVES.eliteEvery === 0 && !isBossWave(wave, last);
}

/** Starts wave `wave`: the horde grows to its size, and its elite or boss arrives. */
export function beginWave(s: SimState, wave: number): void {
  const last = s.config.waves;
  const p = s.players[0];
  s.wave = wave;
  s.waveT = 0;
  // newcomers come from just outside the view, like respawns
  while (s.mobs.length < hordeSize(wave)) {
    const m = newMob(0, 0, mobHp(wave));
    ringPoint(s.ai, p.x, p.y, m);
    s.mobs.push(m);
  }
  if (isEliteWave(wave, last) && !s.elite) {
    const e = newElite(0, 0);
    ringPoint(s.ai, p.x, p.y, e);
    s.elite = e;
  }
  if (isBossWave(wave, last) && !s.boss) {
    const at = body(0, 0);
    ringPoint(s.ai, p.x, p.y, at);
    const hp = wave === last ? BOSS.hp : Math.trunc((BOSS.hp * WAVES.midBossHpPercent) / 100);
    s.boss = newBoss(at.x, at.y, hp);
  }
}

export function waveSystem(s: SimState, events: SimEvent[]): void {
  const last = s.config.waves;
  if (last === 0 || s.outcome !== 'playing') return;
  if (s.players.every((p) => p.dead)) {
    s.outcome = 'lost';
    return;
  }
  s.waveT++;
  if (isBossWave(s.wave, last)) {
    if (s.boss && s.boss.phase !== 'down') return;
    if (s.wave === last) {
      s.outcome = 'won';
      for (const p of s.players) payBet(p);
      events.push({ type: 'cleared' });
      return;
    }
  }
  if (s.waveT < WAVES.ticks) return;
  beginWave(s, s.wave + 1);
  events.push({ type: 'wave', wave: s.wave });
  if (isShrineWave(s.wave, last)) openShrine(s);
}
