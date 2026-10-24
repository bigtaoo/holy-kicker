import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { MONK_IDS } from '@hk/engine';
import { newerBuild, play, rand, randomSave, type Rand } from './saveArb';
import { readSave, type SaveData } from './save';
import { keep } from './saveKeep';
import { leaderOf, mergeSaves } from './saveMerge';
import { MemoryStore, SAVE_KEY, SaveStore } from './saveStore';
import { earnedSutras, unlockedRelics } from './unlocks';

// Properties of the cloud merge (docs/cloud-save.md "Merging two saves") and of writing a save
// back past a newer build's fields ("Older builds"), over random saves from saveArb. Each case
// runs from its own seed, and a failure names it: `forSeeds` replays one with HK_SEED=<seed>.

const CASES = Number(process.env.HK_CASES) || 300;
const only = process.env.HK_SEED;
const seeds = only ? [Number(only)] : Array.from({ length: CASES }, (_, i) => 0x5eed + i * 7919);

function forSeeds(test: (r: Rand) => void): void {
  for (const seed of seeds) {
    try {
      test(rand(seed));
    } catch (e) {
      if (e instanceof Error) e.message = `seed ${seed} (HK_SEED=${seed}): ${e.message}`;
      throw e;
    }
  }
}

type Pair = { a: SaveData; b: SaveData; mode: string };

/** Two copies of one player: unrelated saves, a tie on the leader's keys, or one played on from the other. */
function pair(r: Rand): Pair {
  const a = randomSave(r);
  switch (r.int(3)) {
    case 0:
      return { a, b: randomSave(r), mode: 'apart' };
    case 1: {
      const b = randomSave(r);
      return { a, b: readSave({ ...b, runs: a.runs, cleared: a.cleared, level: a.level, xp: a.xp, chapter: 1 }), mode: 'tie' };
    }
    default:
      return r.chance(0.5) ? { a, b: play(r, a), mode: 'later' } : { a: play(r, a), b: a, mode: 'earlier' };
  }
}

const bitsOf = (n: number) => Array.from({ length: 31 }, (_, i) => n & (1 << i)).filter(Boolean);
const covers = (big: number, small: number) => (big & small) === small;
const atLeast = (m: readonly number[], x: readonly number[]) => x.every((v, i) => (m[i] ?? 0) >= v);
const wordsCover = (m: readonly number[], x: readonly number[]) => x.every((v, i) => covers(m[i] ?? 0, v));

/** What a merge may never lose from `x`, one side of it. */
function keepsProgress(m: SaveData, x: SaveData): void {
  for (const k of ['runs', 'kills', 'trained', 'cleared', 'gifts', 'bestStreak'] as const) expect(m[k], k).toBeGreaterThanOrEqual(x[k]);
  expect(m.level > x.level || (m.level === x.level && m.xp >= x.xp), 'level and xp').toBe(true);
  if (x.firstRunDone) expect(m.firstRunDone).toBe(true);
  if (x.firstDay) expect(m.firstDay).toBeGreaterThan(0);
  if (x.firstDay) expect(m.firstDay).toBeLessThanOrEqual(x.firstDay);
  for (const k of ['best', 'stars', 'hardBest', 'hardStars'] as const) expect(atLeast(m[k], x[k]), k).toBe(true);
  for (const k of ['times', 'hardTimes'] as const) x[k].forEach((t, i) => t && expect(m[k][i], `${k}[${i}]`).toBeGreaterThan(0));
  for (const k of ['times', 'hardTimes'] as const) x[k].forEach((t, i) => t && expect(m[k][i], `${k}[${i}]`).toBeLessThanOrEqual(t));
  for (const k of ['chests', 'opened', 'hardChests', 'hardOpened', 'achieved'] as const) expect(wordsCover(m[k], x[k]), k).toBe(true);
  for (const k of ['monks', 'seen'] as const) expect(covers(m[k], x[k]), k).toBe(true);
  expect(m.codex).toEqual(expect.arrayContaining(x.codex));
  expect(unlockedRelics(m), 'relics').toEqual(expect.arrayContaining(unlockedRelics(x)));
  expect(earnedSutras(m), 'sutras').toEqual(expect.arrayContaining(earnedSutras(x)));
  expect(Object.keys(m.arms)).toEqual(expect.arrayContaining(Object.keys(x.arms)));
  if (x.tester) expect(m.tester).toBe(true);
  if (x.dice) expect(m.dice).toBeGreaterThan(0);
}

/** The fields the leader decides (docs/cloud-save.md): the wallet, the gear, the selections, today's tasks. */
const LED = ['copper', 'jade', 'relic', 'chapter', 'monk', 'hard', 'daily', 'patrol', 'grit', 'challenge', 'weeks'] as const;

describe('mergeSaves, over random pairs', () => {
  it('never loses progress, an unlock or a purchase from either side', () => {
    forSeeds((r) => {
      const { a, b } = pair(r);
      const m = mergeSaves(a, b);
      keepsProgress(m, a);
      keepsProgress(m, b);
    });
  });

  it('takes the wallet, the gear and the selections from the save that played more', () => {
    forSeeds((r) => {
      const { a, b } = pair(r);
      const m = mergeSaves(a, b);
      const lead = leaderOf(a, b) === 'mine' ? a : b;
      for (const k of LED) {
        // a selection the merged progress no longer allows is checked again, as on load
        if (k === 'chapter' || k === 'hard' || k === 'relic') continue;
        expect(m[k], k).toEqual(lead[k]);
      }
      expect(m.chapter).toBe(Math.min(lead.chapter, m.cleared + 1));
      expect(m.relic).toBe(lead.relic);
      // every copy the leader owns is still there (a relic the trail unlocked may add its first copy)
      for (const [item, counts] of Object.entries(lead.gear)) expect(atLeast(m.gear[item as never], counts), item).toBe(true);
    });
  });

  it('is the same both ways round when one save played more, and a tie keeps this device', () => {
    forSeeds((r) => {
      const { a, b, mode } = pair(r);
      const ab = mergeSaves(a, b);
      const ba = mergeSaves(b, a);
      if (leaderOf(a, b) !== leaderOf(b, a)) {
        expect(ab, mode).toEqual(ba);
        return;
      }
      // a tie: each device keeps its own wallet and selections; all the progress agrees
      for (const k of LED) {
        if (k === 'chapter' || k === 'hard') continue;
        expect(ab[k], k).toEqual(a[k]);
        expect(ba[k], k).toEqual(b[k]);
      }
      const progress = ['cleared', 'best', 'stars', 'chests', 'opened', 'runs', 'kills', 'codex', 'monks', 'achieved', 'times', 'bestStreak', 'firstDay'] as const;
      for (const k of progress) expect(ab[k], k).toEqual(ba[k]);
    });
  });

  it('changes nothing merged again with either side, or with itself', () => {
    forSeeds((r) => {
      const { a, b } = pair(r);
      const m = mergeSaves(a, b);
      expect(mergeSaves(m, m)).toEqual(m);
      expect(mergeSaves(m, a)).toEqual(m);
      expect(mergeSaves(m, b)).toEqual(m);
    });
  });

  it('merges three devices to the same progress in any order', () => {
    forSeeds((r) => {
      const a = randomSave(r);
      const b = play(r, a);
      const c = play(r, a);
      const one = mergeSaves(mergeSaves(a, b), c);
      const two = mergeSaves(a, mergeSaves(c, b));
      for (const k of ['cleared', 'best', 'stars', 'chests', 'opened', 'runs', 'kills', 'monks', 'achieved'] as const) expect(one[k], k).toEqual(two[k]);
      expect([...one.codex].sort()).toEqual([...two.codex].sort());
      expect(earnedSutras(one)).toEqual(earnedSutras(two));
      expect(unlockedRelics(one)).toEqual(unlockedRelics(two));
    });
  });
});

/** The save `raw` stored, read, changed to `data` and written back, as SaveStore does. */
function writeBack(data: SaveData, seen: SaveData, raw: Record<string, unknown>): Record<string, unknown> {
  return keep(data, seen, raw) as Record<string, unknown>;
}

describe('keep, over saves a newer build wrote', () => {
  it('writes an unchanged save back exactly as stored', () => {
    forSeeds((r) => {
      const raw = newerBuild(r, randomSave(r));
      const seen = readSave(raw);
      expect(writeBack(seen, seen, raw)).toEqual(raw);
    });
  });

  it('reads back what this build changed, whatever the newer build had added', () => {
    forSeeds((r) => {
      const raw = newerBuild(r, randomSave(r));
      const seen = readSave(raw);
      const data = play(r, seen);
      expect(readSave(writeBack(data, seen, raw))).toEqual(data);
    });
  });

  it("keeps the newer build's chapters, bits, items, keys and evolutions", () => {
    forSeeds((r) => {
      const raw = newerBuild(r, randomSave(r));
      const seen = readSave(raw);
      const out = writeBack(play(r, seen), seen, raw);
      for (const [k, v] of Object.entries(raw)) {
        expect(out, k).toHaveProperty([k]);
        if (Array.isArray(v) && typeof v[0] !== 'object' && k !== 'codex' && k !== 'weeks') expect((out[k] as unknown[]).length, k).toBeGreaterThanOrEqual(v.length);
      }
      const width = (k: string, n: number) => (raw[k] as number) - ((raw[k] as number) % 2 ** n);
      expect(covers(out.monks as number, width('monks', MONK_IDS.length)), 'monks').toBe(true);
      expect(covers(out.seen as number, width('seen', 8)), 'seen').toBe(true);
      for (const k of ['chests', 'opened', 'hardChests', 'hardOpened']) {
        (raw[k] as number[]).forEach((v, i) => {
          for (const bit of bitsOf(v)) if (bit >= 2 ** BALANCE.chests.length) expect(covers((out[k] as number[])[i], bit), `${k}[${i}]`).toBe(true);
        });
      }
      if ((raw.codex as string[]).includes('someday-evolution')) expect(out.codex).toContain('someday-evolution');
      const gear = raw.gear as Record<string, number[]>;
      const kept = out.gear as Record<string, number[]>;
      if (gear.hat) expect(kept.hat).toEqual(gear.hat);
      for (const [item, counts] of Object.entries(gear)) expect(kept[item].length, item).toBeGreaterThanOrEqual(counts.length);
    });
  });

  it('keeps all of it over many sessions in the store', () => {
    forSeeds((r) => {
      const raw = newerBuild(r, randomSave(r));
      const kv = new MemoryStore();
      kv.setItem(SAVE_KEY, JSON.stringify(raw));
      let last = readSave(raw);
      for (let n = 0; n < 4; n++) {
        const store = new SaveStore(kv);
        expect(store.load()).toEqual(last);
        last = play(r, last);
        store.save(last);
      }
      const out = JSON.parse(kv.getItem(SAVE_KEY) as string) as Record<string, unknown>;
      expect(readSave(out)).toEqual(last);
      for (const k of Object.keys(raw)) expect(out, k).toHaveProperty([k]);
      if ((raw.gear as Record<string, unknown>).hat) expect((out.gear as Record<string, unknown>).hat).toEqual((raw.gear as Record<string, unknown>).hat);
    });
  });
});
