import { createState, DEFAULT_RUN, newPlayer } from '@hk/engine';
import { RUN_BUILD } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import { runBuild, runLeave } from './leaveProps';

describe('runLeave', () => {
  it('says how far into the run the player got, with the tutorial step on a first run', () => {
    const s = createState({ ...DEFAULT_RUN, waves: 50 });
    s.players.push(newPlayer(0, 0, 0));
    s.wave = 3;
    s.players[0].level = 4;
    expect(runLeave(s, 1, 120, null)).toEqual({ chapter: 1, wave: 3, level: 4, kills: 120, card: false });
    expect(runLeave(s, 1, 0, 'move')).toMatchObject({ tutorial: 'move' });
  });

  it('adds whether the game had the keys and saw any input, on the first run only', () => {
    const s = createState({ ...DEFAULT_RUN, waves: 50 });
    s.players.push(newPlayer(0, 0, 0));
    const seen = { focus: false, input: true };
    expect(runLeave(s, 1, 9, 'move', seen)).toMatchObject({ tutorial: 'move', focus: false, input: true });
    expect(runLeave(s, 1, 9, null, seen)).not.toHaveProperty('focus');
    expect(runLeave(s, 1, 9, 'move')).not.toHaveProperty('input');
  });

  it('writes the final build and the kiting signal for run_end', () => {
    const s = createState({ ...DEFAULT_RUN, waves: 50 });
    s.players.push(newPlayer(0, 0, 0));
    const p = s.players[0];
    p.spells.push({ id: 'palm', level: 5, cd: 0, evolved: true }, { id: 'bolt', level: 2, cd: 0, evolved: false });
    p.passives.push({ id: 'eye', level: 3 });
    Object.assign(p, { relic: 4, live: 300, moved: 240, travel: 90_000_000 });
    const props = runBuild(s, 300);
    expect(props).toEqual({ spells: 'palm5+,bolt2', passives: 'eye3', relicLv: 4, awakened: false, moving: 80, travel: 300 });
    expect(RUN_BUILD.spells.test(props.spells as string) && RUN_BUILD.passives.test(props.passives as string)).toBe(true);
    expect(runBuild(s, 0)).not.toHaveProperty('travel');
  });
});
