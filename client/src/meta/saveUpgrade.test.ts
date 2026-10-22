import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { anyChestWaiting, openProgressChest } from './progressChests';
import { TIERS } from './gear';
import { parseSave, SAVE_VERSION } from './save';

// A save written by the build live on CrazyGames before progress chests moved to the lobby
// (baee706): it paid every chest a run reached, so it has `chests` and `hardChests` but no
// `opened` or `hardOpened`. Taken verbatim from that build's localStorage.
const LIVE = {
  version: 5, firstRunDone: true, level: 4, xp: 28, copper: 2445, jade: 70, chapter: 2, cleared: 1,
  best: [50, 31, 0, 0, 0], chests: [31, 7, 0, 0, 0], runs: 3, relic: 'staff', codex: [],
  gear: {
    pendant: [2, 0, 0, 0, 0], bracers: [0, 2, 0, 0, 0], robe: [0, 2, 0, 0, 0], sash: [3, 0, 0, 0, 0], sandals: [3, 0, 0, 0, 0],
    ball: [1, 0, 0, 0, 0], staff: [2, 0, 0, 0, 0], fish: [0, 0, 0, 0, 0], beads: [0, 0, 0, 0, 0], bowl: [0, 0, 0, 0, 0],
  },
  trained: 4, patrol: 1792241537820,
  daily: { day: 20261017, free: 0, adChests: 0, quickAds: 0, quickJade: 0, progress: [0, 0, 0, 1, 0], claimed: 0, bonus: false },
  seen: 0, grit: 2, hard: false, hardCleared: 0, hardBest: [0, 0, 0, 0, 0], hardChests: [0, 0, 0, 0, 0],
  fell: [0, 0, 0, 0, 0], hardFell: [0, 0, 0, 0, 0], monk: 'kicker', monks: 1, kills: 7500, achieved: 0, dice: 1524,
  gifts: 0, giftDay: 0, firstDay: 0,
};

describe('a save from the live build before lobby chests', () => {
  it('keeps its progress and opens none of the chests it was already paid for', () => {
    const s = parseSave(JSON.stringify(LIVE));
    const { opened, hardOpened, ...rest } = s;
    // the arrays grow to twenty chapters and eight tiers; the clears read as one star each (save.ts)
    const pad = (a: number[], n = BALANCE.chapters) => [...a, ...Array(n - a.length).fill(0)];
    const { hardCleared: _, ...kept } = LIVE;
    expect(rest).toEqual({
      ...kept, version: SAVE_VERSION, challenge: '', weeks: [], achieved: [], streak: 0, streakDay: 0, bestStreak: 0, dailyBest: { id: '', waves: 0 },
      sutras: 1, // Lotus Steps (wave 25) stored by the unlock re-pacing
      best: pad(LIVE.best), chests: pad(LIVE.chests), stars: pad([1]), hardBest: pad([]), hardStars: pad([]), hardChests: pad([]),
      fell: pad([]), hardFell: pad([]),
      gear: Object.fromEntries(Object.entries(LIVE.gear).map(([k, v]) => [k, pad(v, TIERS)])),
    });
    expect(opened).toEqual(pad(LIVE.chests));
    expect((hardOpened).slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(anyChestWaiting(s)).toBe(false);
    expect(openProgressChest(s, 1, false, 0)).toBeNull();
    expect(openProgressChest(s, 2, false, 2)).toBeNull();
  });

  it('counts hard mode chests as opened too', () => {
    const all = (1 << BALANCE.chests.length) - 1;
    const s = parseSave(JSON.stringify({ ...LIVE, cleared: BALANCE.chapters, chests: [all, all, all, all, all], hard: true, hardCleared: 1, hardChests: [all, 3, 0, 0, 0] }));
    expect((s.hardOpened).slice(0, 5)).toEqual([all, 3, 0, 0, 0]);
    expect(anyChestWaiting(s)).toBe(false);
    expect(openProgressChest(s, 2, true, 0)).toBeNull();
  });
});
