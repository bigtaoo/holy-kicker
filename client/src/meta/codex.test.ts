import { describe, expect, it } from 'vitest';
import { newPlayer } from '@hk/engine';
import { codexEntries, EVOLVE_IDS, evolvedIn, mergeCodex } from './codex';
import { settleRun } from './progress';
import { newSave, parseSave } from './save';

describe('codex', () => {
  it('lists every evolution and awakening with its pair', () => {
    const entries = codexEntries(['palm']);
    expect(entries.map((e) => e.id)).toEqual(EVOLVE_IDS);
    expect(entries.find((e) => e.id === 'palm')).toEqual({ id: 'palm', found: true, pair: 'eye', relic: false });
    expect(entries.find((e) => e.id === 'staff')).toMatchObject({ found: false, pair: 'iron', relic: true });
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
    const first = settleRun(newSave(), { chapter: 1, waves: 12, evolved: ['palm'] });
    expect(first.reward.newCodex).toEqual(['palm']);
    const again = settleRun(first.save, { chapter: 1, waves: 12, evolved: ['palm', 'ball'] });
    expect(again.reward.newCodex).toEqual(['ball']);
    expect(again.save.codex).toEqual(['ball', 'palm']);
    expect(parseSave(JSON.stringify(again.save)).codex).toEqual(['ball', 'palm']);
    expect(parseSave(JSON.stringify({ codex: 'palm' })).codex).toEqual([]);
    expect(settleRun(newSave(), { chapter: 1, waves: 3 }).reward.newCodex).toEqual([]);
  });
});
