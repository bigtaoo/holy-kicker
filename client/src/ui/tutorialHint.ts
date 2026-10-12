import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { TutorialStep } from './tutorial';
import { COLORS, fit, label } from './widgets';

// The first run's hint, drawn low on the screen under the fight (tutorial.ts says which step).
// The move step shows how to move on this device: on a touch screen a finger swaying along a
// track ("drag anywhere"); on a desktop the arrow keys pressed in turn, with the mouse drag as
// the small second line, since few desktop players think of dragging with the mouse.

/** The arrow keys in the order the hint presses them, and how long each stays down. */
export const KEY_ORDER = ['up', 'right', 'down', 'left'] as const;
export type ArrowKey = (typeof KEY_ORDER)[number];
export const KEY_HOLD = 0.45;

/** The key the hint holds down `clock` seconds in. */
export function litKey(clock: number): ArrowKey {
  return KEY_ORDER[Math.floor(Math.max(0, clock) / KEY_HOLD) % KEY_ORDER.length];
}

const KEY = 112;
const GAP = 14;
/** Where each key sits in the cluster (in keys), and the way its arrow points (radians). */
const KEYS: Record<ArrowKey, { col: number; row: number; turn: number }> = {
  up: { col: 0, row: 0, turn: 0 },
  left: { col: -1, row: 1, turn: -Math.PI / 2 },
  down: { col: 0, row: 1, turn: Math.PI },
  right: { col: 1, row: 1, turn: Math.PI / 2 },
};

export interface TutorialHint {
  view: Container;
  /** Animates the hint at `clock` seconds. */
  update(clock: number): void;
}

/** The hint for `step` (not 'done'), `width` wide; `keys` for a desktop. */
export function tutorialHint(step: TutorialStep, width: number, keys: boolean): TutorialHint {
  const view = new Container();
  view.eventMode = 'none';
  const move = step === 'move';
  const lines = !move ? [t(step === 'auto' ? 'tutorial.auto' : 'tutorial.gems')] : keys ? [t('tutorial.keys'), t('tutorial.drag')] : [t('tutorial.move')];
  lines.forEach((text, i) => {
    const l = fit(label(text, i === 0 ? 60 : 48, i === 0 ? COLORS.text : COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), width - 80);
    l.y = i * 80;
    view.addChild(l);
  });
  if (!move) return { view, update() {} };
  return keys ? arrowKeys(view) : swayingFinger(view);
}

function swayingFinger(view: Container): TutorialHint {
  const hand = new Container();
  hand.y = -170;
  hand.addChild(
    new Graphics().roundRect(-150, -6, 300, 12, 6).fill({ color: COLORS.text, alpha: 0.35 }),
    new Graphics().circle(0, 0, 46).fill({ color: COLORS.text, alpha: 0.85 }).stroke({ color: COLORS.outline, width: 8 }),
  );
  view.addChild(hand);
  return { view, update: (clock) => (hand.x = Math.sin(clock * 4) * 120) };
}

function arrowKeys(view: Container): TutorialHint {
  const cluster = new Container();
  cluster.y = -110 - 2 * KEY - GAP;
  const caps = new Map<ArrowKey, { up: Container; down: Container }>();
  for (const key of KEY_ORDER) {
    const { col, row, turn } = KEYS[key];
    const at = { x: col * (KEY + GAP), y: row * (KEY + GAP) + KEY / 2 };
    const up = keyCap(turn, false);
    const down = keyCap(turn, true);
    up.position.set(at.x, at.y);
    down.position.set(at.x, at.y + 8);
    cluster.addChild(up, down);
    caps.set(key, { up, down });
  }
  view.addChild(cluster);
  const update = (clock: number) => {
    const lit = litKey(clock);
    for (const [key, cap] of caps) {
      cap.up.visible = key !== lit;
      cap.down.visible = key === lit;
    }
  };
  update(0);
  return { view, update };
}

/** One key: a raised cap with its arrow, or pressed down and lit in saffron. */
function keyCap(turn: number, pressed: boolean): Container {
  const cap = new Container();
  const h = KEY / 2;
  if (!pressed) cap.addChild(new Graphics().roundRect(-h, -h + 10, KEY, KEY, 20).fill(COLORS.outline));
  cap.addChild(
    new Graphics().roundRect(-h, -h, KEY, KEY, 20).fill(pressed ? COLORS.saffron : COLORS.panel).stroke({ color: COLORS.outline, width: 8 }),
  );
  const arrow = new Graphics().poly([0, -28, 26, 14, -26, 14]).fill(pressed ? COLORS.outline : COLORS.text);
  arrow.rotation = turn;
  cap.addChild(arrow);
  return cap;
}
