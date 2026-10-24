import { describe, expect, it } from 'vitest';
import { newPlayer } from '@hk/engine';
import { codexEntries, EVOLVE_IDS, evolvedIn, mergeCodex } from './codex';
import { BALANCE } from './balance';
import { settleRun } from './progress';
import { newSave, parseSave } from './save';

describe('codex', () => {
  it('lists every evolution and awakening with its pair', () => {
    const entries = codexEntries(['palm']);
    expect(entries.map((e) => e.id)).toEqual(EVOLVE_IDS);
    expect(entries.find((e) => e.id === 'palm')).toEqual({ id: 'palm', found: true, pair: 'eye', relic: false, sutra: null });
    expect(entries.find((e) => e.id === 'staff')).toMatchObject({ found: false, pair: 'iron', relic: true });
    // a sutra spell names its sutra until it is earned
    expect(codexEntries([], []).find((e) => e.id === 'halo')).toMatchObject({ pair: 'focus', sutra: 'halo' });
    expect(codexEntries([], ['halo']).find((e) => e.id === 'halo')).toMatchObject({ sutra: null });
  });

  it('reads what a run evolved', () => {
    const p = newPlayer(0, 0, 0, 100, 0, 'staff');
    expect(evolvedIn(p)).toEqual([]);
    p.awakened = true;
    p.spells.push({ id: 'bolt', level: 5, cd: 0, evolved: true }, { id: 'bell', level: 5, cd: 0, evolved: false });
    expect(evolvedIn(p)).toEqual(['staff', 'bolt']);
  });

  it('merges in Codex order and drops unknown ids', () => {
    expect(mergeCodex(['bolt', 'x', 3], ['ball', 'bolt'])).toEqual(['ball', 'bolt']);
  });

  it('records first evolutions when a run is settled, and the save keeps them', () => {
    const open = { ...newSave(), cleared: BALANCE.unlocks.codexChapter, chapter: BALANCE.unlocks.codexChapter + 1 };
    const first = settleRun(open, { chapter: 1, waves: 12, evolved: ['palm'] });
    expect(first.reward.newCodex).toEqual(['palm']);
    const again = settleRun(first.save, { chapter: 1, waves: 12, evolved: ['palm', 'ball'] });
    expect(again.reward.newCodex).toEqual(['ball']);
    expect(again.save.codex).toEqual(['ball', 'palm']);
    expect(parseSave(JSON.stringify(again.save)).codex).toEqual(['ball', 'palm']);
    expect(parseSave(JSON.stringify({ codex: 'palm' })).codex).toEqual([]);
    expect(settleRun(open, { chapter: 1, waves: 3 }).reward.newCodex).toEqual([]);
  });

  it('announces nothing while the Codex tab is locked, but still records the entries for when it opens', () => {
    const locked = settleRun(newSave(), { chapter: 1, waves: 12, evolved: ['palm'] });
    expect(locked.reward.newCodex).toEqual([]);
    expect(locked.save.codex).toEqual(['palm']);
    // the run that opens the Codex announces its own evolutions
    const opening = settleRun({ ...newSave(), cleared: BALANCE.unlocks.codexChapter - 1, chapter: BALANCE.unlocks.codexChapter },
      { chapter: BALANCE.unlocks.codexChapter, waves: BALANCE.waves, evolved: ['ball'] });
    expect(opening.reward.newCodex).toEqual(['ball']);
  });
});
