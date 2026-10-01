import { Container, Graphics } from 'pixi.js';
import type { CardKind } from '@hk/engine';
import { t } from '../i18n';
import type { CardText } from './cardText';
import type { UiFrame } from './uiLayout';
import { COLORS, backdrop, fit, label, panel } from './widgets';

// The level-up or shrine choice: three large cards stacked down the middle of the portrait screen, one
// thumb tap each. Each card shows an icon by kind (placeholder shapes until the item art),
// the name, "New!" or the level step, and its effect lines.

const CARD_W = 960;
const CARD_H = 330;
const GAP = 44;
const ICON_R = 92;

const KIND_COLOR: Record<CardKind, number> = { relic: COLORS.saffron, spell: 0x5aa8f0, passive: COLORS.jade, shrine: 0xe0607a };

function icon(kind: CardKind): Graphics {
  const g = new Graphics().circle(0, 0, ICON_R).fill(KIND_COLOR[kind]).stroke({ color: COLORS.outline, width: 8 });
  if (kind === 'relic') {
    // the cuju: a ball with two seams
    g.circle(0, 0, ICON_R * 0.55).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 6 });
    g.moveTo(-ICON_R * 0.55, 0).lineTo(ICON_R * 0.55, 0).moveTo(0, -ICON_R * 0.55).lineTo(0, ICON_R * 0.55)
      .stroke({ color: COLORS.outline, width: 5 });
  } else if (kind === 'spell') {
    g.star(0, 0, 5, ICON_R * 0.62, ICON_R * 0.28).fill(0xffffff).stroke({ color: COLORS.outline, width: 6 });
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

function card(text: CardText, onTap: () => void): Container {
  const c = new Container();
  const left = -CARD_W / 2;
  c.addChild(panel(CARD_W, CARD_H, COLORS.panel), icon(text.kind));
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

/** The modal choice over the run under `title`; `onPick` gets the card's index. */
export function cardPanel(f: UiFrame, title: string, texts: readonly CardText[], onPick: (index: number) => void): Container {
  const view = new Container();
  view.addChild(backdrop(f.w, f.h, 0.7));
  const total = texts.length * CARD_H + (texts.length - 1) * GAP;
  const top = f.h / 2 - total / 2 + 60;
  const heading = label(title, 96, COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } });
  heading.position.set(f.w / 2, top - 200);
  const hint = label(t('card.pickOne'), 52, COLORS.text);
  hint.position.set(f.w / 2, top - 90);
  view.addChild(heading, hint);
  texts.forEach((text, i) => {
    const c = card(text, () => onPick(i));
    c.position.set(f.w / 2, top + CARD_H / 2 + i * (CARD_H + GAP));
    view.addChild(c);
  });
  return view;
}
