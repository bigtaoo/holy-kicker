import { Text, type Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { tapAt } from '../testkit/lobbyRig';
import { clearedChapterOne, deviceWith, rigShell } from '../testkit/testShell';

// An iPad on its side plays in the landscape lobby's 4:3 frame (2560x1920), where the chapter card
// stands close to the monk: his soft spotlight once took the taps meant for the card's › arrow.

function arrow(root: Container, glyph: string): Text {
  const found: Text[] = [];
  const walk = (c: Container) => {
    if (c instanceof Text && c.text === glyph) found.push(c);
    c.children.forEach((k) => walk(k as Container));
  };
  walk(root);
  expect(found).toHaveLength(1);
  return found[0];
}

describe('the lobby on a tablet on its side', { timeout: 30_000 }, () => {
  it('turns the chapter with the › and ‹ arrows, not the monk under them', async () => {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), device: 'desktop', sideways: true });
    rig.app.renderer.screen.width = 2048;
    rig.app.renderer.screen.height = 1536;
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await rig.tick(2);
    const stage = rig.app.stage;
    expect(rig.store.load().chapter).toBe(2);
    tapAt(stage, arrow(stage, '‹'));
    await rig.tick(2);
    expect(rig.store.load().chapter).toBe(1);
    tapAt(stage, arrow(stage, '›'));
    await rig.tick(2);
    expect(rig.store.load().chapter).toBe(2);
  });
});
