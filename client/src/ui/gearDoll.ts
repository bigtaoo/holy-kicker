import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { GearSlot, ItemId, Tier } from '../meta/gear';
import type { SaveData } from '../meta/save';
import { lockedLook, type IconSheet } from './buildBar';
import { gearIcon } from './gearIcons';
import { itemName, mergeReady, TIER_COLORS, tierName } from './gearText';
import { BADGE } from './playCard';
import { COLORS, label, playTap, shade } from './widgets';

// The Gear tab's paper doll (docs/design.md "Lobby layout"): the chosen monk in the middle and
// his six slots around him, three a side, each a round light badge (the Play tab's rail family)
// with the item's picture, its name under it (one size, a second line rather than smaller) and
// its tier under that. Weapon, wrists and waist on the left; neck, body and feet on the right.

const SLOT_R = 66;
/** From one slot's badge centre to the next one's down a side. */
const SLOT_STEP = 318;
/** A side's centre from the middle; its labels' width, clear of the hero and the screen's edge. */
const SIDE_X = 382;
const TEXT_W = 284;
const NAME_SIZE = 48;
const NAME_LINE = 52;
const TIER_SIZE = 40;
const LIP = 9;
const READY = 0x4fd1a0;
const STROKE = { stroke: { color: COLORS.outline, width: 7 } };

const CJK = /[\u3040-\u30ff\u3400-\u9fff]/;

const LEFT: readonly GearSlot[] = ['relic', 'bracers', 'sash'];
const RIGHT: readonly GearSlot[] = ['pendant', 'robe', 'sandals'];

/** The doll's height: three slots a side, the lowest with a two-line name. */
export const DOLL_H = SLOT_R + 2 * SLOT_STEP + SLOT_R + LIP + 12 + 2 * NAME_LINE + 2 + TIER_SIZE + 8;
/** Where the hero's feet stand, between the lowest slots' badges (the lobby draws him, gearTab.ts). */
export const HERO_FEET = SLOT_R + 2 * SLOT_STEP + 20;

export interface DollSlot {
  slot: GearSlot;
  item: ItemId;
  tier: Tier | -1;
}

/** The six slots around x = 0 from y = 0 down, room for the hero between them. */
export function gearDoll(save: SaveData, icons: IconSheet, slots: DollSlot[], open: (slot: GearSlot) => void): Container {
  const c = new Container();
  const place = (side: readonly GearSlot[], x: number) => side.forEach((slot, i) => {
    const s = slots.find((w) => w.slot === slot)!;
    const ready = mergeReady(save, s.item);
    const b = slotBadge(icons, s.item, s.tier, ready, () => open(slot));
    b.position.set(x, SLOT_R + i * SLOT_STEP);
    c.addChild(b);
  });
  place(LEFT, -SIDE_X);
  place(RIGHT, SIDE_X);
  return c;
}

function slotBadge(icons: IconSheet, item: ItemId, tier: Tier | -1, ready: boolean, onTap: () => void): Container {
  const view = new Container();
  const found = tier >= 0;
  const fill = found ? BADGE.fill : BADGE.off;
  const base = new Graphics()
    .circle(0, LIP + 6, SLOT_R).fill({ color: 0x000000, alpha: 0.3 })
    .circle(0, LIP, SLOT_R).fill(shade(fill, -0.35)).stroke({ color: COLORS.outline, width: 7 });
  const top = new Container();
  // the tier's colour is the rim: a ring between two outlines, so pale tiers still read on the light face
  const face = new Graphics().circle(0, 0, SLOT_R).fill(fill).stroke({ color: COLORS.outline, width: 7 });
  if (found) face.circle(0, 0, SLOT_R - 9).stroke({ color: TIER_COLORS[tier], width: 10 }).circle(0, 0, SLOT_R - 15).stroke({ color: COLORS.outline, width: 3 });
  else face.circle(0, 0, SLOT_R - 14).stroke({ color: shade(fill, -0.12), width: 3 });
  top.addChild(face);
  const icon = gearIcon(icons, item, SLOT_R * 1.4);
  if (icon) {
    if (!found) lockedLook(icon, true);
    top.addChild(icon);
  }
  if (ready) {
    // five alike wait to merge: a jade dot on the badge's shoulder
    top.addChild(new Graphics().circle(SLOT_R * 0.72, -SLOT_R * 0.72, 20).fill(READY).stroke({ color: COLORS.outline, width: 6 }));
  }
  const name = label(itemName(item), NAME_SIZE, found ? COLORS.text : COLORS.dim, {
    // Chinese and Japanese names have no spaces: they may break between any two characters
    ...STROKE, wordWrap: true, wordWrapWidth: TEXT_W, lineHeight: NAME_LINE, breakWords: CJK.test(itemName(item)),
  });
  name.anchor.set(0.5, 0);
  // it wraps between words; only a single word wider than the column, or a third line (which would
  // run into the slot below), makes it smaller
  const k = Math.min(1, TEXT_W / name.width, (2 * NAME_LINE + 8) / name.height);
  name.scale.set(k);
  name.y = SLOT_R + LIP + 12;
  const sub = label(found ? tierName(tier as Tier) : t('gear.none'), TIER_SIZE, found ? TIER_COLORS[tier] : COLORS.dim, STROKE);
  sub.anchor.set(0.5, 0);
  if (sub.width > TEXT_W) sub.scale.set(TEXT_W / sub.width);
  sub.y = name.y + name.height + 2;
  view.addChild(base, top, name, sub);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  view.hitArea = { contains: (x: number, y: number) => x * x + y * y <= (SLOT_R + 16) ** 2 || (Math.abs(x) <= TEXT_W / 2 && y > 0 && y <= sub.y + sub.height) };
  let down = false;
  const press = (on: boolean) => (top.y = on ? LIP * 0.7 : 0);
  view.on('pointerdown', () => {
    down = true;
    press(true);
  });
  const reset = () => {
    down = false;
    press(false);
  };
  view.on('pointerupoutside', reset);
  view.on('pointerleave', reset);
  view.on('pointerup', () => {
    const fire = down;
    reset();
    if (fire) {
      playTap();
      onTap();
    }
  });
  return view;
}
