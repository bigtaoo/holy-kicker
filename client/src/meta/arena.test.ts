import { describe, expect, it } from 'vitest';
import { ARENA } from '@hk/engine';
import { arenaBetter, arenaCopper, arenaOpen, arenaSetup, chooseArena, settleArena, showsArena } from './arena';
import { BALANCE } from './balance';
import { chooseTrack, selectChapter } from './progress';
import { newSave, parseSave, type SaveData } from './save';

// The arena (docs/design.md "Arena"): open after the first clear, an endless run with no revive that
// pays copper for the minutes survived, a best kept by wave and then time, and a card the chapter
// switches take back.

const cleared = (): SaveData => ({ ...newSave(), firstRunDone: true, cleared: 1, chapter: 2 });

describe('the arena', () => {
  it('opens with the first clear, and the card shows it only while open', () => {
    expect(arenaOpen(newSave())).toBe(false);
    expect(chooseArena(newSave()).arena).toBe(false);
    expect(showsArena({ ...newSave(), arena: true })).toBe(false);
    const s = chooseArena(cleared());
    expect(s.arena).toBe(true);
    expect(showsArena(s)).toBe(true);
    // a chapter or a track switch shows the chapters again
    expect(chooseTrack(s, false).arena).toBe(false);
    expect(selectChapter(s, 1).arena).toBe(false);
  });

  it('plays the arena run: endless, no revive, no hard mode or first run', () => {
    const setup = arenaSetup({ ...cleared(), hard: true });
    expect(setup).toMatchObject({ chapter: ARENA.chapter, waves: ARENA.waves, revives: 0, hard: false, firstRun: false, arena: true });
  });

  it('pays copper by the minute, up to its cap', () => {
    const { copperPerMinute, copperCap } = BALANCE.arena;
    expect(arenaCopper(0)).toBe(0);
    expect(arenaCopper(-5)).toBe(0);
    expect(arenaCopper(600)).toBe(copperPerMinute);
    expect(arenaCopper(300)).toBe(Math.floor(copperPerMinute / 2));
    expect(arenaCopper(600 * 1000)).toBe(copperCap);
  });

  it('ranks by waves, then by time', () => {
    expect(arenaBetter({ waves: 5, tenths: 10 }, { waves: 4, tenths: 9999 })).toBe(true);
    expect(arenaBetter({ waves: 5, tenths: 10 }, { waves: 5, tenths: 9 })).toBe(true);
    expect(arenaBetter({ waves: 5, tenths: 10 }, { waves: 5, tenths: 10 })).toBe(false);
    expect(arenaBetter({ waves: 4, tenths: 9999 }, { waves: 5, tenths: 0 })).toBe(false);
  });

  it('settles a run: copper, the run, its kills and evolutions counted, the best kept or raised', () => {
    const s = cleared();
    const first = settleArena(s, { waves: 8, tenths: 1800, kills: 412, evolved: ['bowl'] });
    expect(first.reward).toEqual({ copper: arenaCopper(1800), before: { waves: 0, tenths: 0 }, newBest: true });
    expect(first.save).toMatchObject({ copper: s.copper + arenaCopper(1800), runs: s.runs + 1, kills: s.kills + 412, arenaBest: { waves: 8, tenths: 1800 } });
    expect(first.save.codex).toContain('bowl');
    // no chapter progress
    expect(first.save.best).toEqual(s.best);
    expect(first.save.cleared).toBe(s.cleared);
    const worse = settleArena(first.save, { waves: 6, tenths: 2400, kills: 0 });
    expect(worse.reward.newBest).toBe(false);
    expect(worse.save.arenaBest).toEqual({ waves: 8, tenths: 1800 });
  });

  it('keeps the arena in the save through a reload', () => {
    const s = settleArena(chooseArena(cleared()), { waves: 9, tenths: 2000, kills: 0 }).save;
    const back = parseSave(JSON.stringify(s));
    expect(back.arena).toBe(true);
    expect(back.arenaBest).toEqual({ waves: 9, tenths: 2000 });
  });
});
