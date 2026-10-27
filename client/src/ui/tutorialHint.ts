import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { Dir8 } from './gatherNudge';
import type { TutorialStep } from './tutorial';
import { COLORS, fit, label } from './widgets';

// The first run's hint, drawn low on the screen under the fight (tutorial.ts says which step).
// The move step shows how to move on this device: on a touch screen a finger swaying along a
// track ("drag anywhere"); on a desktop the arrow keys pressed in turn, with the mouse as the
// small second line: the hero follows a hovering mouse (game/hoverSteer.ts), no click or drag. In a portal's
// iframe the keys only reach the game after a click in it, so until then a pulsing line over the
// keys asks for that click and the keys stand dimmed. The gather step is no tutorial step but a
// nudge for a hero standing still among gems (gatherNudge.ts), on the same line, showing the
// way to the most of them: the key or two for that way pressed again and again, or the finger
// dragging that way.

/** A line the HUD shows low on the screen: a tutorial step, or the gather nudge. */
export type HintStep = TutorialStep | 'gather';

/** The arrow keys in the order the hint presses them, and how long each stays down. */
export const KEY_ORDER = ['up', 'right', 'down', 'left'] as const;
export type ArrowKey = (typeof KEY_ORDER)[number];
export const KEY_HOLD = 0.45;

/** The keys that walk the hero `dir` (an eighth of the circle, 0 right, clockwise). */
export function dirKeys(dir: Dir8): ArrowKey[] {
  const ways: ArrowKey[][] = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
  return ways[dir];
}

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

/** The hint for `step` (not 'done'), `width` wide; on a desktop `keys` says whether the keys reach the game now; `dir` is the gather nudge's way. */
export function tutorialHint(step: HintStep, width: number, keys: (() => boolean) | null, dir: Dir8 = 2): TutorialHint {
  const view = new Container();
  view.eventMode = 'none';
  const move = step === 'move';
  const lines = !move ? [t(step === 'auto' ? 'tutorial.auto' : step === 'gather' ? 'tutorial.gather' : 'tutorial.gems')] : keys ? [t('tutorial.keys'), t('tutorial.mouse')] : [t('tutorial.move')];
  lines.forEach((text, i) => {
    const l = fit(label(text, i === 0 ? 60 : 48, i === 0 ? COLORS.text : COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), width - 80);
    l.y = i * 80;
    view.addChild(l);
  });
  if (step === 'gather') {
    const ways = dirKeys(dir);
    return keys ? arrowKeys(view, width, keys, (clock) => (Math.floor(clock / KEY_HOLD) % 2 === 0 ? ways : [])) : draggingFinger(view, dir);
  }
  if (!move) return { view, update() {} };
  return keys ? arrowKeys(view, width, keys, (clock) => [litKey(clock)]) : swayingFinger(view);
}

/** A finger dragging from the track's middle out the way `dir` points, again and again. */
function draggingFinger(view: Container, dir: Dir8): TutorialHint {
  const turn = (dir * Math.PI) / 4;
  const pad = new Container();
  pad.y = -200;
  pad.addChild(
    new Graphics().circle(0, 0, 150).fill({ color: COLORS.text, alpha: 0.12 }).stroke({ color: COLORS.text, width: 6, alpha: 0.35 }),
    new Graphics().roundRect(0, -6, 150, 12, 6).fill({ color: COLORS.text, alpha: 0.35 }),
  );
  pad.children[1].rotation = turn;
  const hand = new Graphics().circle(0, 0, 46).fill({ color: COLORS.text, alpha: 0.85 }).stroke({ color: COLORS.outline, width: 8 });
  pad.addChild(hand);
  view.addChild(pad);
  const update = (clock: number) => {
    const k = Math.min(1, (clock % 1.1) / 0.7);
    const d = 120 * (1 - (1 - k) * (1 - k));
    hand.position.set(Math.cos(turn) * d, Math.sin(turn) * d);
  };
  update(0);
  return { view, update };
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

function arrowKeys(view: Container, width: number, reach: () => boolean, lit: (clock: number) => readonly ArrowKey[]): TutorialHint {
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
  const click = fit(label(t('tutorial.click'), 56, COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), width - 80);
  click.y = cluster.y - 70;
  const base = click.scale.x;
  view.addChild(click);
  const update = (clock: number) => {
    const off = !reach();
    click.visible = off;
    click.scale.set(base * (1 + 0.06 * Math.sin(clock * 6)));
    cluster.alpha = off ? 0.4 : 1;
    const down = lit(clock);
    for (const [key, cap] of caps) {
      cap.up.visible = !down.includes(key);
      cap.down.visible = down.includes(key);
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
