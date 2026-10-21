import { ACTS, actRule, AFFIX, AFFIXES, hasAffix, HURT } from '../config';
import type { SimEvent } from '../events';
import type { Foe, SimState } from '../state';
import { splitInto } from './ghost';
import { howl } from './snow';
import { ring } from './threats';

// The affixes of act 3 on (acts.ts AFFIX, docs/design.md "Acts"): an elite comes with one, a boss
// or mid-boss with two, drawn from the run's ai stream as it arrives. The shield takes whole hits
// (damage() asks guards() first), haste speeds its cooldowns and howls, and split and explode go off
// at every AFFIX.steps-th of its health it loses (foeHurt, from damage()).

/** `n` different affixes drawn from s.ai, as a bit mask. */
function roll(s: SimState, n: number): number {
  let mask = 0;
  for (let k = 0; k < Math.min(n, AFFIXES.length); k++) {
    // the k-th free one, counting from a random start
    let pick = s.ai.int(AFFIXES.length - k);
    for (let a = 0; a < AFFIXES.length; a++) {
      if (mask & (1 << a)) continue;
      if (pick-- === 0) {
        mask |= 1 << a;
        break;
      }
    }
  }
  return mask;
}

/** Gives a foe arriving in this run its affixes (none before act 3): `boss` for a boss or mid-boss. */
export function arm(s: SimState, foe: Foe, boss: boolean): void {
  if (s.config.waves === 0 || !actRule(s.config.chapter, ACTS.affixes)) return;
  foe.affixes = roll(s, boss ? ACTS.bossAffixes : ACTS.eliteAffixes);
  foe.guard = hasAffix(foe.affixes, 'shield') ? AFFIX.shieldBlocks : 0;
  foe.guardT = 0;
}

/** True when the foe's shield takes this hit whole (one block fewer until it grows back). */
export function guards(foe: Foe): boolean {
  if (foe.guard <= 0) return false;
  foe.guard--;
  foe.guardT = 0;
  return true;
}

/** The foe lost health from `before`: a split or explode affix goes off for every step of it crossed. */
export function foeHurt(s: SimState, foe: Foe, before: number): void {
  const split = hasAffix(foe.affixes, 'split');
  const explode = hasAffix(foe.affixes, 'explode');
  if (!split && !explode) return;
  const step = (hp: number) => Math.trunc(((foe.maxHp - hp) * AFFIX.steps) / Math.max(1, foe.maxHp));
  for (let k = step(before); k < step(foe.hp); k++) {
    if (split) splitInto(s, 'shard', AFFIX.splitShards, AFFIX.splitSpread, foe.x, foe.y);
    if (explode) {
      ring(s, foe.x, foe.y, 0, AFFIX.explodeBullets, (s.tick * 4099) & 0xffff);
      s.zones.push({ x: foe.x, y: foe.y, radius: AFFIX.explodeRadius, age: 0, hurt: HURT.zone });
    }
  }
}

/** A tick of `pct` percent speed has one more step than an ordinary one on these ticks. */
function extraStep(tick: number, pct: number): boolean {
  const k = pct - 100;
  return Math.trunc((tick * k) / 100) !== Math.trunc(((tick - 1) * k) / 100);
}

/** Shields grow back; hasted foes count their cooldowns down faster and howl. Runs after the elites and the boss. */
export function affixSystem(s: SimState, events: SimEvent[]): void {
  const fast = extraStep(s.tick, AFFIX.hastePercent);
  const tick = (foe: Foe) => {
    if (foe.affixes === 0) return;
    if (hasAffix(foe.affixes, 'shield') && foe.guard < AFFIX.shieldBlocks && ++foe.guardT >= AFFIX.shieldRegen) {
      foe.guard++;
      foe.guardT = 0;
    }
    if (!hasAffix(foe.affixes, 'haste')) return;
    if (s.tick % AFFIX.hasteHowl === 0) howl(s, foe, events);
    if (!fast) return;
    if ('cd' in foe) {
      if (foe.cd > 1) foe.cd--;
    } else if (foe.phase === 'walk' && foe.cooldown > 1) foe.cooldown--;
  };
  for (const e of s.elites) tick(e);
  if (s.boss && s.boss.phase !== 'down') tick(s.boss);
}

