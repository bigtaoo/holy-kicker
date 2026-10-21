import { ColorMatrixFilter, Container, Graphics } from 'pixi.js';
import { BALANCE } from '../meta/balance';
import { track } from '../meta/progress';
import { chestsWaiting } from '../meta/progressChests';
import type { SaveData } from '../meta/save';
import { iconSprite, type IconSheet } from './buildBar';
import { COLORS, dot, label } from './widgets';

/**
 * The five progress chests of a chapter over their waves, on the lobby's chapter card: one a run
 * reached waits lit, with a dot, until a tap opens it (`open` with its index); an opened one is
 * dimmed with a tick; one not reached yet is a muted red, so five of them do not outshout PLAY.
 */
let muted: ColorMatrixFilter | null = null;
function mute(): ColorMatrixFilter {
  if (!muted) {
    muted = new ColorMatrixFilter();
    muted.saturate(-0.65, true);
    muted.brightness(0.88, true);
  }
  return muted;
}

export function chestRow(save: SaveData, chapter: number, icons: IconSheet, open: (index: number) => void): Container {
  const row = new Container();
  const waiting = chestsWaiting(save, chapter, save.hard);
  const reached = track(save, save.hard).chests[chapter - 1];
  BALANCE.chests.forEach((c, i) => {
    const x = (i - 2) * 160;
    const ready = (waiting & (1 << i)) !== 0;
    const got = !ready && (reached & (1 << i)) !== 0;
    if (ready) row.addChild(new Graphics().circle(x, 50, 70).fill({ color: COLORS.saffron, alpha: 0.35 }).stroke({ color: COLORS.saffron, width: 6 }));
    const chest = iconSprite(icons, 'chest', ready ? 112 : 96);
    if (chest) {
      chest.position.set(x, 50);
      if (got) chest.alpha = 0.4;
      else if (!ready) chest.filters = [mute()];
      row.addChild(chest);
    }
    if (ready) {
      row.addChild(dot(x + 50, 0));
      const hit = new Graphics().circle(x, 60, 80).fill({ color: 0, alpha: 0.001 });
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointertap', () => open(i));
      row.addChild(hit);
    }
    if (got) {
      row.addChild(new Graphics().moveTo(x - 22, 50).lineTo(x - 4, 68).lineTo(x + 28, 30)
        .stroke({ color: COLORS.outline, width: 22, cap: 'round', join: 'round' })
        .moveTo(x - 22, 50).lineTo(x - 4, 68).lineTo(x + 28, 30)
        .stroke({ color: COLORS.jade, width: 12, cap: 'round', join: 'round' }));
    }
    const wave = label(String(c.wave), 40, got ? COLORS.dim : COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    wave.position.set(x, 112);
    row.addChild(wave);
  });
  return row;
}
