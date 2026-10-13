import { createState, DEFAULT_RUN, newPlayer } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { runLeave } from './leaveProps';

describe('runLeave', () => {
  it('says how far into the run the player got, with the tutorial step on a first run', () => {
    const s = createState({ ...DEFAULT_RUN, waves: 50 });
    s.players.push(newPlayer(0, 0, 0));
    s.wave = 3;
    s.players[0].level = 4;
    expect(runLeave(s, 1, 120, null)).toEqual({ chapter: 1, wave: 3, level: 4, kills: 120, card: false });
    expect(runLeave(s, 1, 0, 'move')).toMatchObject({ tutorial: 'move' });
  });
});
