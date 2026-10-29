import { RELIC_IDS } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { SAVES } from './fixtures';
import { ITEM_IDS, TIERS } from './gear';
import { newSave, parseSave, SAVE_VERSION, type SaveData } from './save';
import { leaderOf, mergeSaves } from './saveMerge';
import { MemoryStore, SAVE_KEY, SaveStore } from './saveStore';
import { earnedSutras, unlockedRelics } from './unlocks';

// Every stored save of the corpus (fixtures/README.md), one per SAVE_VERSION as the last build of
// that version wrote it, through the whole pipeline: the upgrade on load, the store's write back
// and the cloud merge.

type Raw = Readonly<Record<string, unknown>>;
const nums = (v: unknown) => (v ?? []) as number[];
const pad = (a: readonly number[], n = BALANCE.chapters) => [...a, ...new Array<number>(n - a.length).fill(0)];
const VERSIONS = Object.keys(SAVES).map(Number);

/** The relics a save of `raw`'s version had unlocked: one per chapter cleared, from the cuju (unlocks.ts OLD gates). */
function oldRelics(raw: Raw): string[] {
  return RELIC_IDS.filter((_, i) => i <= (raw.cleared as number));
}

describe('the save corpus', () => {
  it('has a save of every version up to this one', () => {
    expect(VERSIONS).toEqual(Array.from({ length: SAVE_VERSION }, (_, i) => i + 1));
    for (const v of VERSIONS) expect(SAVES[v].version).toBe(v);
  });
});

describe.each(VERSIONS)('a version %i save', (v) => {
  const raw = SAVES[v];
  const text = JSON.stringify(raw);
  const s = parseSave(text);

  it('keeps the wallet, the clears, the runs and the selections on the upgrade', () => {
    const scalar = ['firstRunDone', 'level', 'xp', 'copper', 'jade', 'chapter', 'cleared', 'runs', 'relic'] as const;
    for (const k of scalar) expect(s[k], k).toBe(raw[k]);
    const later = { trained: 0, patrol: 0, seen: 0xff, grit: 0, hard: false, monk: 'kicker', kills: 0, dice: 0, gifts: 0, giftDay: 0, firstDay: 0, challenge: '' };
    for (const [k, none] of Object.entries(later)) expect(s[k as keyof SaveData], k).toBe(raw[k] ?? none);
    expect(s.codex).toEqual(raw.codex);
    // copper chests came within version 7: a stored day bought none; a day stored before version 8 keeps the fixed five
    const day = raw.daily as { day?: number; tasks?: unknown } | undefined;
    const fixed = (day?.day === raw.firstDay ? BALANCE.daily.firstDay : BALANCE.daily.legacy).map((g) => ({ ...g, id: '' }));
    expect(s.daily).toEqual(day ? { copperChests: 0, ...day, tasks: day.tasks ?? fixed } : s.daily);
    expect(s.weeks).toEqual(raw.weeks ?? []);
  });

  it('keeps every chapter: best waves, chests, falls and stars', () => {
    expect(s.best).toEqual(pad(nums(raw.best)));
    expect(s.chests).toEqual(pad(nums(raw.chests)));
    // a save from before opening chests in the lobby was paid every chest it reached
    expect(s.opened).toEqual(pad(nums(raw.opened ?? raw.chests)));
    expect(s.fell).toEqual(pad(nums(raw.fell)));
    for (let i = 0; i < BALANCE.chapters; i++) {
      if (raw.stars) expect(s.stars[i]).toBe(nums(raw.stars)[i] ?? 0);
      // before stars: a clear is one star, and with hard mode open (all five cleared) three
      else expect(s.stars[i]).toBe(i >= s.cleared ? 0 : raw.hard !== undefined && s.cleared >= 5 ? 3 : 1);
    }
  });

  it('keeps hard mode: its clears, chests and stars', () => {
    const hardCleared = (raw.hardCleared as number | undefined) ?? 0;
    for (let i = 0; i < BALANCE.chapters; i++) {
      const stored = nums(raw.hardBest)[i] ?? 0;
      expect(s.hardBest[i]).toBe(i < hardCleared ? BALANCE.waves : stored);
      if (s.hardBest[i] >= BALANCE.waves) expect(s.hardStars[i]).toBeGreaterThanOrEqual(1);
    }
    expect(s.hardStars).toEqual(raw.hardStars ? pad(nums(raw.hardStars)) : s.hardBest.map((b) => (b >= BALANCE.waves ? 1 : 0)));
    expect(s.hardChests).toEqual(pad(nums(raw.hardChests)));
    expect(s.hardOpened).toEqual(pad(nums(raw.hardOpened ?? raw.hardChests)));
    expect(s.hardFell).toEqual(pad(nums(raw.hardFell)));
  });

  it('keeps every gear copy, every relic it had unlocked and every monk', () => {
    const gear = (raw.gear ?? {}) as Record<string, number[]>;
    for (const id of ITEM_IDS) {
      const had = gear[id] ?? [];
      if (had.some((n) => n > 0)) expect(s.gear[id], id).toEqual(pad(had, TIERS));
      // an unlocked relic without a copy (a version 1 save has no gear) gets its one
      else expect(s.gear[id], id).toEqual(pad(RELIC_IDS.includes(id as never) && unlockedRelics(s).includes(id as never) ? [1] : [], TIERS));
    }
    for (const r of oldRelics(raw)) expect(unlockedRelics(s), r).toContain(r);
    const monks = (raw.monks as number | undefined) ?? 1;
    expect(s.monks & monks).toBe(monks);
    const achieved = raw.achieved;
    expect(s.achieved).toEqual(typeof achieved === 'number' ? [achieved] : achieved ?? []);
  });

  it('keeps the sutras it had earned', () => {
    // the gates before the re-paced unlocks: wave 25, one codex entry, two clears, ten runs
    const best = nums(raw.best);
    const old = [best.some((b) => b >= 25), nums(raw.codex).length >= 1, (raw.cleared as number) >= 2, (raw.runs as number) >= 10];
    const earned = earnedSutras(s);
    if (raw.sutras === undefined) old.forEach((had, i) => had && expect(s.sutras & (1 << i)).toBeTruthy());
    else expect(s.sutras).toBe(raw.sutras);
    expect(earned.length).toBeGreaterThanOrEqual(raw.sutras === undefined ? old.filter(Boolean).length : 0);
  });

  it('upgrades the same twice as once', () => {
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });

  it('parses, writes back and parses the same through the store', () => {
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, text);
    const store = new SaveStore(kv);
    const loaded = store.load();
    expect(loaded).toEqual(s);
    store.save(loaded);
    // this version's save goes back as it was stored, field for field; an older one upgraded
    if (v === SAVE_VERSION) expect(kv.getItem(SAVE_KEY)).toBe(text);
    else expect(JSON.parse(kv.getItem(SAVE_KEY) as string)).toEqual(s);
    expect(new SaveStore(kv).load()).toEqual(s);
  });

  it('merges with itself into itself, and with a new device into itself', () => {
    expect(mergeSaves(s, s)).toEqual(s);
    // a fresh install pulling this save from the cloud slot, and the slot pulling the fresh install
    const fresh = newSave();
    expect(leaderOf(fresh, s)).toBe('other');
    expect(mergeSaves(fresh, s)).toEqual(s);
    expect(mergeSaves(s, fresh)).toEqual(s);
  });
});

describe('the version 8 save', () => {
  it('reads exactly as stored', () => {
    const raw = SAVES[SAVE_VERSION];
    expect(parseSave(JSON.stringify(raw))).toEqual(raw);
  });
});
