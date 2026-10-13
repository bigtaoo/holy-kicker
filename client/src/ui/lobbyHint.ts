import { giftReady } from '../meta/welcome';
import type { Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import { chestsLeft } from '../meta/shop';
import { trainBlock } from '../meta/training';

// The arrow over a lobby tab for a new player (docs/retention.md): half the players who finish a
// first run never buy anything in the lobby, and those come back far less. Until chapter 1 is
// cleared it points at the next thing waiting: the welcome gift on Play, the first training
// node, the shop's free chest. Pure, so it is tested without Pixi.

export function hintTab(save: SaveData, now: number, current: Tab): Tab | null {
  if (!save.firstRunDone || save.cleared > 0) return null;
  const want: Tab | null = giftReady(save, now) ? 'play'
    : save.trained === 0 && trainBlock(save) === null ? 'train'
    : chestsLeft(save, now, 'free') === 1 ? 'shop'
    : null;
  return want === current ? null : want;
}
