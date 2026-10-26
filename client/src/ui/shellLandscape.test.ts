import type { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { computeViewport } from '../game/viewport';
import { clearedChapterOne, deviceWith, rigShell, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';
import { uiFrame } from './uiLayout';

// A desktop window wider than tall on a web host: the run plays in landscape, and the screens
// around it (lobby, results) lay out in the same wide frame, not in the 3:4 one.

const W = 1600;
const H = 900;

/** The shell's screen's view, which sits at its frame's origin and scale. */
const screenView = (rig: ShellRig) => (rig.shell as unknown as { screen: { view: Container } }).screen.view;

function inFrame(rig: ShellRig, wide: boolean): boolean {
  const f = uiFrame(computeViewport(W, H, wide));
  const v = screenView(rig);
  return Math.abs(v.x - f.x) < 1 && Math.abs(v.scale.x - f.scale) < 1e-6;
}

describe('a landscape desktop', { timeout: 30_000 }, () => {
  it('lays out the lobby, the run and its results in the wide frame', async () => {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), device: 'desktop', sideways: true });
    rig.app.renderer.screen.width = W;
    rig.app.renderer.screen.height = H;
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await rig.tick(2);
    expect(inFrame(rig, true)).toBe(true);
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    expect(rig.shell.run!.engine.state.config.wide).toBe(true);
    await tapNamed(rig, 'II');
    await tapWhenUp(rig, 'run.giveUp');
    await tapWhenUp(rig, 'run.giveUpConfirm');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(2);
    expect(inFrame(rig, true)).toBe(true);
    expect(rig.faults).toEqual([]);
  });

  it('keeps the 3:4 frame where runs stay portrait', async () => {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), device: 'desktop' });
    rig.app.renderer.screen.width = W;
    rig.app.renderer.screen.height = H;
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await rig.tick(2);
    expect(inFrame(rig, false)).toBe(true);
    expect(inFrame(rig, true)).toBe(false);
  });
});
