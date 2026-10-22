import { describe, expect, it } from 'vitest';
import { BALANCE } from '../meta/balance';
import { newSave } from '../meta/save';
import { openChest } from '../meta/shop';
import { train } from '../meta/training';
import { claimGift } from '../meta/welcome';
import { hintTab } from './lobbyHint';

const NOON = new Date(2026, 9, 4, 12).getTime();
const rand = () => 0.5;

describe('lobby hint', () => {
  it('walks a new player through the gift, the first training node and the free chest', () => {
    let s = { ...newSave(), firstRunDone: true, copper: 500 };
    expect(hintTab(s, NOON, 'shop')).toBe('play');
    expect(hintTab(s, NOON, 'play')).toBeNull();
    s = claimGift(s, NOON)!.save;
    expect(hintTab(s, NOON, 'play')).toBe('train');
    expect(hintTab(s, NOON, 'train')).toBeNull();
    s = train(s);
    expect(hintTab(s, NOON, 'train')).toBe('shop');
    s = openChest(s, NOON, 'free', rand)!.save;
    expect(hintTab(s, NOON, 'play')).toBeNull();
  });

  it('skips training it cannot pay for, and stays quiet before the first run and after chapter 1', () => {
    const poor = { ...newSave(), firstRunDone: true, gifts: BALANCE.welcome.length };
    expect(hintTab(poor, NOON, 'play')).toBe('shop');
    expect(hintTab(newSave(), NOON, 'play')).toBeNull();
    expect(hintTab({ ...poor, cleared: 1 }, NOON, 'play')).toBeNull();
  });
});
