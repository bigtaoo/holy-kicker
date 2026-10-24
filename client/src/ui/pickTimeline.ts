import { Container, Graphics } from 'pixi.js';
import type { CardKind } from '@hk/engine';
import type { PickWire } from '@hk/protocol';
import { evolvedIcon, iconSprite, type IconSheet } from './buildBar';
import { KIND_COLOR } from './cardPanel';
import { timelineLayout } from './replaySeek';
import { COLORS, label } from './widgets';

// A weekly top run's picks in order (docs/design.md "Challenges"): each card taken as a disc in
// its kind's colour with the item's icon (an evolution with a gold rim, a shrine blessing as an
// incense flame), the wave it came on under it. Under the board for the top rows, and under the
// replay, where the pick at the replay's tick is ringed, the ones still to come are dimmed, and a
// tap on one jumps the replay there.

export interface TimelineOptions {
  /** The pick to ring (the replay's), -1 for none; the ones after it are dimmed. */
  current?: number;
  /** A tap on pick `i`. */
  tap?: (i: number) => void;
  /** The largest cell. */
  max?: number;
}

const GOLD_RIM = COLORS.gold;

/** The timeline in a box `width` by `height`, centred on x 0 with its top at y 0. */
export function pickTimeline(picks: readonly PickWire[], icons: IconSheet, width: number, height: number, o: TimelineOptions = {}): Container {
  const root = new Container();
  const g = timelineLayout(picks.length, width, height, o.max ?? 96);
  const cols = Math.min(g.cols, Math.max(1, picks.length));
  const current = o.current ?? -1;
  picks.forEach((p, i) => {
    const cell = pickCell(p, icons, g.cell, i === current);
    cell.position.set((i % cols - (cols - 1) / 2) * g.cell, Math.floor(i / cols) * g.rowH + g.cell / 2);
    if (o.current !== undefined && i > current) cell.alpha = 0.45;
    const tap = o.tap;
    if (tap) {
      cell.eventMode = 'static';
      cell.cursor = 'pointer';
      cell.on('pointertap', () => tap(i));
    }
    root.addChild(cell);
  });
  return root;
}

/** One pick: the taken card's disc and icon, its wave under it; `ringed` for the replay's current one. */
function pickCell(p: PickWire, icons: IconSheet, cell: number, ringed: boolean): Container {
  const c = new Container();
  const [kind, id] = (p.offered[p.took] ?? 'shrine:').split(':') as [CardKind, string];
  const r = cell * 0.4;
  const disc = new Graphics();
  if (ringed) disc.circle(0, 0, r + 8).fill(COLORS.saffron);
  disc.circle(0, 0, r).fill(KIND_COLOR[kind] ?? COLORS.dim).stroke({ color: kind === 'evolve' ? GOLD_RIM : COLORS.outline, width: kind === 'evolve' ? 6 : 4 });
  c.addChild(disc);
  const icon = kind === 'shrine' ? null : (kind === 'evolve' ? evolvedIcon : iconSprite)(icons, id, r * 1.5);
  if (icon) c.addChild(icon);
  else {
    // an incense flame, as on the shrine's card
    const f = r * 0.6;
    c.addChild(new Graphics().poly([0, -f, f * 0.55, f * 0.15, 0, f * 0.7, -f * 0.55, f * 0.15]).fill(0xfff2d8).stroke({ color: COLORS.outline, width: 3 }));
  }
  const wave = label(String(p.wave), Math.round(cell * 0.5), ringed ? COLORS.saffron : COLORS.dim);
  wave.y = r + cell * 0.3;
  c.addChild(wave);
  // the whole cell takes the tap, not just the disc
  c.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= cell / 2 && y >= -cell / 2 && y <= cell };
  return c;
}
