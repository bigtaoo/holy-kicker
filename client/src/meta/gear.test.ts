import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { bestTier, canMerge, gearStats, itemStats, merge, mergeAll, rollDrops, worn, type Inventory } from './gear';
import { loadout } from './loadout';
import { settleRun } from './progress';
import { newSave, parseSave, type SaveData } from './save';
import { nextNode, train, trainBlock, trainingStats, trainNode } from './training';

const G = BALANCE.gear;

/** A random source that walks a fixed list (then repeats it). */
function seq(...xs: number[]): () => number {
  let i = 0;
  return () => xs[i++ % xs.length];
}

function withGear(save: SaveData, item: keyof Inventory, counts: number[]): SaveData {
  return { ...save, gear: { ...save.gear, [item]: counts } };
}

describe('gear', () => {
  it('adds one affix per tier on top of the main stats', () => {
    const robe = G.items.robe;
    expect(itemStats('robe', 0)).toEqual({ maxHp: robe.main.maxHp![0] });
    const sacred = itemStats('robe', 4);
    // two guard affixes and the maxHp one stack onto the main stat
    expect(sacred.maxHp).toBe(robe.main.maxHp![4] + 10);
    expect(sacred.guard).toBe(25);
    expect(sacred.regen).toBe(2);
  });

  it('wears the best tier owned, and the relic slot holds the chosen relic', () => {
    let s = newSave();
    expect(worn(s).find((w) => w.slot === 'relic')).toEqual({ slot: 'relic', item: 'ball', tier: 0 });
    expect(worn(s).find((w) => w.slot === 'robe')!.tier).toBe(-1);
    s = withGear(s, 'robe', [3, 0, 1, 0, 0]);
    expect(bestTier(s.gear, 'robe')).toBe(2);
    expect(gearStats(s).maxHp).toBe(itemStats('robe', 2).maxHp);
    expect(gearStats(s).attack).toBe(G.items.relic.main.attack![0]);
  });

  it('merges five of a tier and the copper into one of the next', () => {
    let s = { ...withGear(newSave(), 'pendant', [6, 0, 0, 0, 0]), copper: 250 };
    expect(canMerge(s, 'pendant', 0)).toBe(true);
    s = merge(s, 'pendant', 0);
    expect(s.gear.pendant).toEqual([1, 1, 0, 0, 0]);
    expect(s.copper).toBe(250 - G.mergeCopper[0]);
    // not enough copies, then not enough copper
    expect(merge(s, 'pendant', 0)).toBe(s);
    const poor = { ...withGear(s, 'pendant', [5, 0, 0, 0, 0]), copper: 10 };
    expect(canMerge(poor, 'pendant', 0)).toBe(false);
  });

  it('merges all it can, lowest tiers first so the results merge again', () => {
    const s = { ...withGear(newSave(), 'sash', [25, 0, 0, 0, 0]), copper: 1e6 };
    const { save, done } = mergeAll(s);
    expect(save.gear.sash).toEqual([0, 0, 1, 0, 0]);
    expect(done.map((d) => d.tier)).toEqual([1, 1, 1, 1, 1, 2]);
    expect(save.copper).toBe(1e6 - 5 * G.mergeCopper[0] - G.mergeCopper[1]);
  });

  it('drops one item per ten waves and a chance at one for the rest', () => {
    expect(rollDrops(1, 50, ['ball'], false, seq(0.5))).toHaveLength(5);
    expect(rollDrops(1, 3, ['ball'], false, seq(0.5))).toHaveLength(0);
    expect(rollDrops(1, 3, ['ball'], false, seq(0.1))).toHaveLength(1);
    // the first run always drops one
    expect(rollDrops(1, 0, ['ball'], true, seq(0.9))).toHaveLength(1);
  });

  it('drops only unlocked relics, and tiers by the chapter', () => {
    const all = rollDrops(5, 50 * 40, ['ball', 'staff'], false, Math.random);
    const relics = all.map((d) => d.item).filter((i) => !['pendant', 'bracers', 'robe', 'sash', 'sandals'].includes(i));
    expect(new Set(relics)).toEqual(new Set(['ball', 'staff']));
    expect(rollDrops(1, 500, ['ball'], false, Math.random).every((d) => d.tier === 0)).toBe(true);
    expect(all.every((d) => d.tier >= 1)).toBe(true);
  });

  it('a run pays its drops into the save, and a first clear brings a copy of the new relic', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 50 }, seq(0.3));
    expect(reward.drops).toHaveLength(5);
    const owned = Object.values(save.gear).flat().reduce((a, b) => a + b, 0);
    // the starting ball and the staff's copy
    expect(owned).toBe(5 + 2);
    expect(bestTier(save.gear, 'staff')).toBe(0);
  });

  it('reads a version 1 save as no gear, with a copy of every unlocked relic', () => {
    const s = parseSave(JSON.stringify({ version: 1, cleared: 2, relic: 'fish' }));
    expect(s.trained).toBe(0);
    expect(s.gear.ball[0] + s.gear.staff[0] + s.gear.fish[0]).toBe(3);
    expect(s.gear.pendant).toEqual([0, 0, 0, 0, 0]);
    expect(parseSave(JSON.stringify({ ...s, gear: { robe: [2, 'x', -4, 1] } })).gear.robe).toEqual([2, 0, 0, 1, 0]);
  });
});

describe('training', () => {
  it('lays out a fixed line: the cycle, free revives, rising cost, one node per level', () => {
    const t = BALANCE.training;
    expect(trainNode(1)).toEqual({ n: 1, stat: t.cycle[0][0], value: t.cycle[0][1], cost: t.costBase, level: 2 });
    expect(trainNode(t.reviveNodes[0]).stat).toBe('revive');
    expect(trainNode(3).cost).toBe(t.costBase + 2 * t.costStep);
  });

  it('buys nodes in order, gated by level and copper', () => {
    let s = { ...newSave(), copper: 1000 };
    expect(trainBlock(s)).toBe('level');
    s = { ...s, level: 3 };
    expect(trainBlock(s)).toBeNull();
    s = train(train(s));
    expect(s.trained).toBe(2);
    expect(trainBlock(s)).toBe('level');
    expect(nextNode(s)!.n).toBe(3);
    expect(trainBlock({ ...s, level: 9, copper: 0 })).toBe('copper');
    expect(trainBlock({ ...s, trained: BALANCE.training.nodes })).toBe('done');
  });

  it('pays more copper from runs once copper nodes are bought', () => {
    const n = BALANCE.training.cycle.findIndex(([stat]) => stat === 'copper') + 1;
    const s = { ...newSave(), trained: n };
    const more = trainingStats(s).copper!;
    expect(settleRun(s, { chapter: 1, waves: 10 }).reward.copper).toBe(Math.round(100 * (100 + more) / 100));
  });
});

describe('loadout', () => {
  it('sums gear and training into the engine bonus, revives apart', () => {
    const t = BALANCE.training;
    const s = { ...withGear(newSave(), 'robe', [1, 0, 0, 0, 0]), trained: t.reviveNodes[0] };
    const l = loadout(s);
    expect(l.freeRevives).toBe(1);
    expect(l.bonus.maxHp).toBe(itemStats('robe', 0).maxHp! + (trainingStats(s).maxHp ?? 0));
    expect('copper' in l.bonus || 'revive' in l.bonus).toBe(false);
  });
});
