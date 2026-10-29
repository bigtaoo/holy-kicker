import { MONK_IDS, RELIC_IDS } from '@hk/engine';
import { BALANCE } from './balance';
import { EVOLVE_IDS } from './codex';
import { newDaily } from './daily';
import type { Task } from './taskPool';
import { canMerge, ITEM_IDS, merge, TIERS, type Tier } from './gear';
import { ACHIEVED_BITS, readSave, SAVE_VERSION, type SaveData } from './save';
import { unlockedRelics } from './unlocks';

// Random saves for the property tests (saveProps.test.ts); nothing in the game imports it. Every
// generator takes a seeded Rand, so a failing case is replayed from its seed.

export interface Rand {
  /** [0, 1) */
  next(): number;
  /** An integer in [0, n). */
  int(n: number): number;
  chance(p: number): boolean;
  pick<T>(a: readonly T[]): T;
}

/** mulberry32: small, fast and plenty for test cases. */
export function rand(seed: number): Rand {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { next, int, chance: (p) => next() < p, pick: (a) => a[int(a.length)] };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const per = (f: (i: number) => number) => Array.from({ length: BALANCE.chapters }, (_, i) => f(i));
const FULL = 2 ** BALANCE.chests.length - 1;
const GOALS = BALANCE.achievements.length;

/** A valid save of this build: random progress, read back through readSave as a stored one would be. */
export function randomSave(r: Rand): SaveData {
  const cleared = r.chance(0.2) ? 0 : r.int(BALANCE.chapters + 1);
  const stars = per((i) => (i < cleared ? 1 + r.int(3) : 0));
  const hardBest = per((i) => (stars[i] === 3 && r.chance(0.5) ? (r.chance(0.5) ? BALANCE.waves : r.int(BALANCE.waves)) : 0));
  const chests = per((i) => (i <= cleared ? r.int(FULL + 1) : 0));
  const hardChests = per((i) => (hardBest[i] ? r.int(FULL + 1) : 0));
  const gear: Record<string, number[]> = {};
  for (const id of ITEM_IDS) gear[id] = Array.from({ length: TIERS }, (_, t) => (r.chance(0.4 / (t + 1)) ? 1 + r.int(4) : 0));
  const day = 20261001 + r.int(28);
  const streakDay = 20360 + r.int(30);
  const dayTasks: Task[] = BALANCE.daily.pool.filter(() => r.chance(0.4)).map((e) => ({ kind: e.kind, n: 1 + r.int(e.n), id: '' }));
  return readSave({
    version: SAVE_VERSION, firstRunDone: cleared > 0 || r.chance(0.7), level: 1 + r.int(40), xp: r.int(600),
    copper: r.int(100000), jade: r.int(3000), chapter: 1 + r.int(cleared + 1), cleared, stars,
    best: per((i) => (i < cleared ? BALANCE.waves : i === cleared ? r.int(BALANCE.waves) : 0)),
    chests, opened: chests.map((c) => c & r.int(FULL + 1)), runs: cleared * 3 + r.int(60), relic: r.pick(RELIC_IDS),
    codex: EVOLVE_IDS.filter(() => r.chance(0.3)), gear, sutras: r.int(16), trained: r.int(BALANCE.training.nodes + 1),
    patrol: r.chance(0.5) ? 1792000000000 + r.int(1e9) : 0,
    daily: { ...newDaily(day, dayTasks), free: r.int(3), progress: dayTasks.map(() => r.int(4)), claimed: r.int(8) },
    seen: r.int(256), grit: r.int(BALANCE.grit.max + 1), hard: r.chance(0.5), hardBest, hardChests,
    hardStars: hardBest.map(() => 1 + r.int(3)), hardOpened: hardChests.map((c) => c & r.int(FULL + 1)),
    fell: per(() => (r.chance(0.2) ? r.int(BALANCE.waves) : 0)), hardFell: per(() => (r.chance(0.1) ? r.int(BALANCE.waves) : 0)),
    times: per((i) => (i < cleared && r.chance(0.6) ? 3000 + r.int(4000) : 0)),
    hardTimes: hardBest.map((b) => (b >= BALANCE.waves && r.chance(0.6) ? 4000 + r.int(4000) : 0)),
    monk: r.pick(MONK_IDS), monks: r.int(2 ** MONK_IDS.length), kills: r.int(200000),
    achieved: Array.from({ length: Math.ceil(GOALS / ACHIEVED_BITS) }, () => r.int(2 ** ACHIEVED_BITS)),
    dice: r.chance(0.8) ? 1 + r.int(500) : 0, gifts: r.int(BALANCE.welcome.length + 1), giftDay: r.chance(0.5) ? day : 0,
    firstDay: r.chance(0.7) ? 20261001 + r.int(10) : 0, challenge: r.chance(0.3) ? `d${day}` : '', weeks: [],
    streak: r.int(8), streakDay, bestStreak: r.int(10), dailyBest: r.chance(0.5) ? { id: `d${day}`, waves: r.int(BALANCE.waves) } : { id: '', waves: 0 },
    arms: r.chance(0.3) ? { first20: r.pick(['short', 'control', '']) } : {}, tester: r.chance(0.1),
  });
}

/** What a session of play does to a save: runs, clears, drops and merges, purchases, claims, selections. */
export function play(r: Rand, save: SaveData, steps = 1 + r.int(6)): SaveData {
  let s = clone(save);
  for (let n = 0; n < steps; n++) {
    const c = s.cleared;
    switch (r.int(10)) {
      case 0: // a run: copper, kills, maybe a clear
        s.runs++;
        s.kills += r.int(3000);
        s.copper += r.int(2000);
        s.xp += r.int(200);
        if (c < BALANCE.chapters && r.chance(0.4)) {
          s.cleared = c + 1;
          s.best[c] = BALANCE.waves;
          s.stars[c] = Math.max(s.stars[c], 1 + r.int(3));
          s.chests[c] = FULL;
        }
        break;
      case 1: { // a drop, and maybe a merge of its tier
        const item = r.pick(ITEM_IDS);
        const t = r.int(TIERS - 1) as Tier;
        s.gear[item][t] += 1 + r.int(3);
        if (canMerge(s, item, t)) s = merge(s, item, t);
        break;
      }
      case 2: { // a merge of any mergeable stack, relics' granted copies included
        const stacks = ITEM_IDS.flatMap((item) => Array.from({ length: TIERS - 1 }, (_, t) => ({ item, t: t as Tier }))).filter((x) => canMerge(s, x.item, x.t));
        if (stacks.length) {
          const x = r.pick(stacks);
          s = merge(s, x.item, x.t);
        }
        break;
      }
      case 3: // a monk bought and worn, or training
        s.monks |= 1 << r.int(MONK_IDS.length);
        s.monk = r.pick(MONK_IDS.filter((_, i) => s.monks & (1 << i)));
        if (s.trained < BALANCE.training.nodes) s.trained++;
        s.copper = Math.max(0, s.copper - r.int(3000));
        break;
      case 4: // chests opened, an achievement claimed
        s.opened = s.opened.map((o, i) => o | (s.chests[i] & r.int(FULL + 1)));
        if (s.achieved.length || r.chance(0.5)) {
          const g = r.int(GOALS);
          const w = Math.floor(g / ACHIEVED_BITS);
          while (s.achieved.length <= w) s.achieved.push(0);
          s.achieved[w] |= 1 << g % ACHIEVED_BITS;
        }
        s.jade += r.int(50);
        break;
      case 5: // an evolution found, a tab seen
        s.codex = [...new Set([...s.codex, r.pick(EVOLVE_IDS)])];
        s.seen |= 1 << r.int(8);
        break;
      case 6: // the selections
        s.relic = r.pick(unlockedRelics(s));
        s.chapter = 1 + r.int(Math.min(BALANCE.chapters, s.cleared + 1));
        s.hard = r.chance(0.3);
        break;
      case 7: // today's tasks
        s.daily = { ...s.daily, progress: s.daily.progress.map((p) => p + r.int(2)), claimed: s.daily.claimed | (s.daily.tasks.length ? 1 << r.int(s.daily.tasks.length) : 0) };
        break;
      case 8: // a daily challenge and a welcome gift
        s.streak++;
        s.streakDay++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        if (s.gifts < BALANCE.welcome.length) s.gifts++;
        break;
      default: // spent
        s.jade = Math.max(0, s.jade - r.int(500));
        s.copper = Math.max(0, s.copper - r.int(5000));
    }
  }
  return readSave(clone(s) as unknown as Record<string, unknown>);
}

/** What a newer build of the same version adds to a stored save: chapters, bits, an item, a tier, an evolution, keys. */
export function newerBuild(r: Rand, save: SaveData): Record<string, unknown> {
  const raw = clone(save) as unknown as Record<string, unknown>;
  const more = 1 + r.int(5);
  for (const k of ['best', 'stars', 'fell', 'times', 'hardBest', 'hardStars', 'hardFell', 'hardTimes']) {
    if (r.chance(0.5)) raw[k] = [...(raw[k] as number[]), ...Array.from({ length: more }, () => r.int(4))];
  }
  for (const k of ['chests', 'opened', 'hardChests', 'hardOpened']) {
    if (r.chance(0.5)) raw[k] = (raw[k] as number[]).map((v) => v + (r.chance(0.3) ? 2 ** (BALANCE.chests.length + r.int(3)) : 0));
  }
  if (r.chance(0.5)) raw.monks = (raw.monks as number) + 2 ** (MONK_IDS.length + r.int(3));
  if (r.chance(0.5)) raw.seen = (raw.seen as number) + 2 ** (8 + r.int(4));
  if (r.chance(0.5)) raw.achieved = [...(raw.achieved as number[]), ...Array(3).fill(0)].slice(0, Math.ceil(GOALS / ACHIEVED_BITS)).concat([1 + r.int(7)]);
  if (r.chance(0.5)) raw.codex = [...(raw.codex as string[]), 'someday-evolution'];
  const gear = raw.gear as Record<string, unknown>;
  if (r.chance(0.5)) gear.hat = [r.int(3), r.int(3)];
  if (r.chance(0.5)) {
    const item = r.pick(ITEM_IDS);
    gear[item] = [...(gear[item] as number[]), 1 + r.int(2)];
  }
  if (r.chance(0.5)) raw.pets = { cat: r.int(9) };
  if (r.chance(0.3)) (raw.daily as Record<string, unknown>).spins = r.int(3);
  return raw;
}
