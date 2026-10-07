import { afterEach, describe, expect, it, vi } from 'vitest';
import { packDice, type BoardName } from '@hk/protocol';
import { newSave } from '../meta/save';
import { MemoryStore } from '../meta/saveStore';
import { diceName } from './boardPanel';
import { PlayerName } from './playerName';

// The player's name: the portal account's when signed in, none for a guest on a host with
// accounts, else a dice name, and when the server hears it.

function setup(portal: string | null, online = true, accounts = portal !== null) {
  const sent: BoardName[] = [];
  const net = { online, sendName: async (n: BoardName) => (sent.push(n), true) };
  const storage = new MemoryStore();
  return { sent, storage, names: new PlayerName(net, storage, { userName: () => portal, accounts: () => accounts }) };
}

describe('player name', () => {
  afterEach(() => vi.useRealTimers());

  it('rolls a dice name on the first launch and keeps it after', () => {
    const { names } = setup(null);
    const save = names.withDice(newSave(), () => 0);
    expect(save.dice).toBe(packDice(0, 0, 10));
    expect(names.withDice(save, () => 0.5)).toBe(save);
    expect(names.shown(save)).toBe(diceName(save.dice));
    expect(names.board(save)).toEqual({ dice: save.dice });
  });

  it('goes by the portal account when signed in, unless the boards would refuse its name', () => {
    const save = { ...newSave(), dice: packDice(1, 2, 33) };
    expect(setup('kicker42').names.shown(save)).toBe('kicker42');
    expect(setup('kicker42').names.board(save)).toEqual({ name: 'kicker42' });
    expect(setup('x').names.board(save)).toEqual({ dice: save.dice });
  });

  it('keeps a guest off the boards where the host has accounts', () => {
    const save = { ...newSave(), dice: packDice(1, 2, 33) };
    const guest = setup(null, true, true).names;
    expect(guest.ranked()).toBe(false);
    expect(guest.rolls()).toBe(false);
    expect(guest.board(save)).toBeNull();
    expect(guest.shown(save)).not.toBe(diceName(save.dice));
    // without accounts (the web, WeChat, a partner site without CrazyGames accounts) the die names everyone
    const plain = setup(null, true, false).names;
    expect([plain.ranked(), plain.rolls()]).toEqual([true, true]);
    expect(plain.board(save)).toEqual({ dice: save.dice });
    expect(setup('kicker42').names.rolls()).toBe(false);
  });

  it('sends nothing for a guest kept off the boards', async () => {
    vi.useFakeTimers();
    const { names, sent } = setup(null, true, true);
    names.sync({ ...newSave(), dice: packDice(0, 0, 13) });
    await vi.runAllTimersAsync();
    expect(sent).toEqual([]);
  });

  it('sends the last of a burst of rolls once, and nothing it already sent', async () => {
    vi.useFakeTimers();
    const { names, sent } = setup(null);
    for (const n of [11, 12, 13]) names.sync({ ...newSave(), dice: packDice(0, 0, n) });
    await vi.runAllTimersAsync();
    expect(sent).toEqual([{ dice: packDice(0, 0, 13) }]);
    names.sync({ ...newSave(), dice: packDice(0, 0, 13) });
    await vi.runAllTimersAsync();
    expect(sent).toHaveLength(1);
  });

  it('sends nothing offline', async () => {
    vi.useFakeTimers();
    const { names, sent } = setup(null, false);
    names.sync({ ...newSave(), dice: packDice(0, 0, 13) });
    await vi.runAllTimersAsync();
    expect(sent).toEqual([]);
  });
});
