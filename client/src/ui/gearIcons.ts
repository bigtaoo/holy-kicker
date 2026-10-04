import type { Container } from 'pixi.js';
import type { ItemId } from '../meta/gear';
import { iconSprite, type IconSheet } from './buildBar';

// Gear icons: every item, relic or slot item, has a painted icon on the icon sheet under its id
// (art/monk/icons, packed by tools/pack_icons.py).

export function gearIcon(icons: IconSheet, item: ItemId, size: number): Container | null {
  return iconSprite(icons, item, size);
}
