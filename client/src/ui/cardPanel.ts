import { Container, Graphics } from 'pixi.js';
import type { CardKind } from '@hk/engine';
import { t } from '../i18n';
import { iconSprite, type IconSheet } from './buildBar';
import { cardPose, cardsSettled, rimPoints } from './cardGate';
import type { CardText } from './cardText';
import type { UiFrame } from './uiLayout';
import { COLORS, backdrop, fit, label, panel } from './widgets';

// The level-up or shrine choice: three large cards stacked down the middle of the portrait screen, one
// thumb tap each. Each card shows the item's icon on a disc in its kind's colour (with what it
// evolves with small on the corner), the name, "New!" or the level step, and its effect lines.
// Shrine blessings have no item and keep a drawn shape. The cards rise in grey and only take taps
// once a gold line has run round their rims (cardGate.ts).

const CARD_W = 960;
const CARD_H = 330;
const GAP = 44;
const ICON_R = 92;
const PAIR_R = 36;
const CARD_RADIUS = 28;
/** A locked card is drawn this grey. */
const LOCKED_TINT = 0x8a8a8a;

const KIND_COLOR: Record<CardKind, number> = {
  relic: COLORS.saffron, spell: 0x5aa8f0, passive: COLORS.jade, shrine: 0xe0607a, evolve: 0xffc83a,
};
/** An evolution is a gold card: a warm panel with a bright rim. */
const GOLD_PANEL = 0x5a4216;
const GOLD_RIM = 0xffd860;

function shape(kind: CardKind): Graphics {
  const g = new Graphics().circle(0, 0, ICON_R).fill(KIND_COLOR[kind]).stroke({ color: COLORS.outline, width: 8 });
  if (kind === 'relic') {
    // the cuju: a ball with two seams
    g.circle(0, 0, ICON_R * 0.55).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 6 });
    g.moveTo(-ICON_R * 0.55, 0).lineTo(ICON_R * 0.55, 0).moveTo(0, -ICON_R * 0.55).lineTo(0, ICON_R * 0.55)
      .stroke({ color: COLORS.outline, width: 5 });
  } else if (kind === 'spell') {
    g.star(0, 0, 5, ICON_R * 0.62, ICON_R * 0.28).fill(0xffffff).stroke({ color: COLORS.outline, width: 6 });
  } else if (kind === 'evolve') {
    // a rising arrow over a burst
    const r = ICON_R * 0.62;
    g.star(0, 0, 8, r, r * 0.62).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 6 });
    g.poly([0, -r * 0.7, r * 0.42, -r * 0.1, r * 0.16, -r * 0.1, r * 0.16, r * 0.55, -r * 0.16, r * 0.55, -r * 0.16, -r * 0.1, -r * 0.42, -r * 0.1])
      .fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 5 });
  } else if (kind === 'shrine') {
    // an incense flame
    const r = ICON_R * 0.6;
    g.poly([0, -r, r * 0.55, r * 0.15, 0, r * 0.7, -r * 0.55, r * 0.15]).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 6 });
  } else {
    const r = ICON_R * 0.55;
    g.poly([0, -r, r, 0, 0, r, -r, 0]).fill(0xffffff).stroke({ color: COLORS.outline, width: 6 });
  }
  return g;
}

function icon(text: CardText, icons: IconSheet): Container {
  const art = text.icon && iconSprite(icons, text.icon, ICON_R * 1.5);
  if (!art) return shape(text.kind);
  const c = new Container();
  c.addChild(new Graphics().circle(0, 0, ICON_R).fill(KIND_COLOR[text.kind]).stroke({ color: COLORS.outline, width: 8 }), art);
  if (text.kind === 'evolve') {
    // the rising arrow of the evolution, on the upper right
    const r = PAIR_R;
    const arrow = new Graphics().circle(0, 0, r).fill(GOLD_RIM).stroke({ color: COLORS.outline, width: 6 })
      .poly([0, -r * 0.6, r * 0.5, 0, r * 0.18, 0, r * 0.18, r * 0.55, -r * 0.18, r * 0.55, -r * 0.18, 0, -r * 0.5, 0])
      .fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 4 });
    arrow.position.set(ICON_R * 0.72, -ICON_R * 0.72);
    c.addChild(arrow);
  }
  // what it evolves with, along the lower right of the disc
  text.pairs.slice(0, 2).forEach((id, i) => {
    const pair = new Container();
    pair.position.set(ICON_R * 0.78 - i * PAIR_R * 1.7, ICON_R * 0.78);
    pair.addChild(new Graphics().circle(0, 0, PAIR_R).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 6 })
      .circle(0, 0, PAIR_R - 4).stroke({ color: GOLD_RIM, width: 3 }));
    const small = iconSprite(icons, id, PAIR_R * 1.5);
    if (small) pair.addChild(small);
    c.addChild(pair);
  });
  return c;
}

function card(text: CardText, icons: IconSheet, onTap: () => void, locked: () => boolean): Container {
  const c = new Container();
  const left = -CARD_W / 2;
  const gold = text.kind === 'evolve';
  const back = panel(CARD_W, CARD_H, gold ? GOLD_PANEL : COLORS.panel);
  if (gold) back.roundRect(-CARD_W / 2 + 14, -CARD_H / 2 + 14, CARD_W - 28, CARD_H - 28, 20).stroke({ color: GOLD_RIM, width: 6 });
  c.addChild(back, icon(text, icons));
  c.children[1].position.set(left + 40 + ICON_R, 0);
  const x = left + 80 + ICON_R * 2;
  const room = CARD_W / 2 - x - 36;
  const name = fit(label(text.name, 60), room * 0.62);
  name.anchor.set(0, 0.5);
  name.position.set(x, -CARD_H / 2 + 70);
  const tag = fit(label(text.tag, 48, text.fresh ? COLORS.saffron : COLORS.dim), room * 0.38);
  tag.anchor.set(1, 0.5);
  tag.position.set(CARD_W / 2 - 36, -CARD_H / 2 + 70);
  c.addChild(name, tag);
  // up to three effect lines below the name
  text.lines.slice(0, 3).forEach((line, i) => {
    const l = fit(label(line, 48, COLORS.text), CARD_W / 2 - x - 36);
    l.anchor.set(0, 0.5);
    l.position.set(x, -CARD_H / 2 + 150 + i * 62);
    c.addChild(l);
  });
  c.eventMode = 'static';
  c.cursor = 'pointer';
  let down = false;
  c.on('pointerdown', () => {
    // a touch that starts while the card is locked never counts, even if it lifts later
    if (locked()) return;
    down = true;
    c.scale.set(0.97);
  });
  const reset = () => {
    down = false;
    c.scale.set(1);
  };
  c.on('pointerupoutside', reset);
  c.on('pointerleave', reset);
  c.on('pointerup', () => {
    const fire = down;
    reset();
    if (fire) onTap();
  });
  return c;
}

export interface CardPanel {
  view: Container;
  /** Poses the cards `age` seconds after the choice opened. */
  update(age: number): void;
}

/** The modal choice over the run under `title`; `onPick` gets the card's index. */
export function cardPanel(
  f: UiFrame, title: string, texts: readonly CardText[], icons: IconSheet, onPick: (index: number) => void,
): CardPanel {
  const view = new Container();
  view.addChild(backdrop(f.w, f.h, 0.7));
  const total = texts.length * CARD_H + (texts.length - 1) * GAP;
  const top = f.h / 2 - total / 2 + 60;
  const heading = label(title, 96, COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } });
  heading.position.set(f.w / 2, top - 200);
  const hint = label(t('card.pickOne'), 52, COLORS.text);
  hint.position.set(f.w / 2, top - 90);
  view.addChild(heading, hint);
  let locked = true;
  const cards = texts.map((text, i) => {
    const body = card(text, icons, () => onPick(i), () => locked);
    const rim = new Graphics();
    const c = new Container();
    c.addChild(body, rim);
    view.addChild(c);
    return { c, body, rim, y: top + CARD_H / 2 + i * (CARD_H + GAP) };
  });
  let settled = false;
  const update = (age: number) => {
    if (settled) return;
    settled = cardsSettled(age);
    cards.forEach(({ c, body, rim, y }, i) => {
      const pose = cardPose(age, i);
      locked = pose.locked;
      c.position.set(f.w / 2, y + pose.y);
      c.alpha = pose.alpha;
      c.scale.set(pose.scale);
      body.tint = pose.locked ? LOCKED_TINT : 0xffffff;
      rim.clear();
      if (pose.rimAlpha > 0 && pose.rim > 0) {
        rim.poly(rimPoints(CARD_W, CARD_H, CARD_RADIUS, pose.rim), false)
          .stroke({ color: GOLD_RIM, width: 10, alpha: pose.rimAlpha, cap: 'round', join: 'round' });
      }
    });
  };
  update(0);
  return { view, update };
}
