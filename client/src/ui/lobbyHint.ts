import { giftReady } from '../meta/welcome';
import type { Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import { chestsLeft } from '../meta/shop';
import { trainBlock } from '../meta/training';

// The arrow over a lobby tab for a new player (docs/retention.md): half the players who finish a
// first run never buy anything in the lobby, and those come back far less. Until chapter 1 is
// cleared it points at the next thing waiting: the welcome gift on Play, the first training
// node, the shop's free chest. Pure, so it is tested without Pixi.

/** The tab with the new player's next step, wherever they are; the tab bar keeps only its dot. */
export function nextStep(save: SaveData, now: number): Tab | null {
  if (!save.firstRunDone || save.cleared > 0) return null;
  return giftReady(save, now) ? 'play'
    : save.trained === 0 && trainBlock(save) === null ? 'train'
    : chestsLeft(save, now, 'free') === 1 ? 'shop'
    : null;
}

/** The tab the arrow points at: the next step, unless the player is on it already. */
export function hintTab(save: SaveData, now: number, current: Tab): Tab | null {
  const want = nextStep(save, now);
  return want === current ? null : want;
}
