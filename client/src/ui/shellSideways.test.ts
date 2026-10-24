import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { clearedChapterOne, deviceWith, rigShell, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';
import { liveRun } from '../testkit/liveRun';

// The "turn upright" cover (Shell.coverSideways): a touch-only phone held sideways mid-run gets it
// over everything, and the fight behind it waits on the pause panel.

/** A phone or tablet with no mouse, as the media queries answer (ui/media.ts touchOnly). */
function touchDevice(): void {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(hover: none) and (pointer: coarse)' }));
}

/** The screen turned to `w`x`h` (CSS pixels, as the app's screen reads them). */
function turn(rig: ShellRig, w: number, h: number): void {
  rig.app.renderer.screen.width = w;
  rig.app.renderer.screen.height = h;
}

const rotate = () => t('common.rotate');
/** The cover: the topmost container on the stage, holding the ask. */
function cover(rig: ShellRig): Container | null {
  const top = rig.app.stage.children[rig.app.stage.children.length - 1];
  return top && rig.texts().includes(rotate()) && top.children.some((c) => 'text' in c && c.text === rotate()) ? top : null;
}

afterEach(() => vi.unstubAllGlobals());

describe('a phone held sideways', () => {
  it('covers the run, its HUD and a later toast, and the fight waits on the pause panel', async () => {
    touchDevice();
    const run = await liveRun();
    turn(run, 390, 844);
    run.steer('bot');
    await run.ticks(30);
    expect(rotate()).not.toBe('common.rotate');
    expect(run.texts()).not.toContain(rotate());

    turn(run, 844, 390);
    await run.tick(1);
    const view = cover(run);
    expect(view).not.toBeNull();
    expect(run.game().paused).toBe(true);
    const at = run.sim().tick;
    await run.tick(60);
    expect(run.sim().tick).toBe(at);

    // a toast added on top comes under the cover at the next frame
    const toast = new Container();
    run.app.stage.addChild(toast);
    await run.tick(1);
    expect(cover(run)).toBe(view);
    expect(run.app.stage.getChildIndex(toast)).toBeLessThan(run.app.stage.getChildIndex(view!));
    expect(run.faults).toEqual([]);
  });

  it('turned back, takes the cover off and leaves the run paused until the player resumes', async () => {
    touchDevice();
    const run = await liveRun();
    turn(run, 390, 844);
    await run.ticks(10);
    turn(run, 844, 390);
    await run.tick(2);
    const view = cover(run)!;
    turn(run, 390, 844);
    await run.tick(2);
    expect(view.destroyed).toBe(true);
    expect(run.texts()).not.toContain(rotate());
    expect(run.game().paused).toBe(true);
    expect(run.texts()).toContain(t('run.paused'));
    const at = run.sim().tick;
    await run.tick(30);
    expect(run.sim().tick).toBe(at);
    await tapWhenUp(run, 'run.resume');
    await run.ticks(5);
    expect(run.game().paused).toBe(false);
  });

  it('a run the player resumed pauses again the next time the phone turns', async () => {
    touchDevice();
    const run = await liveRun();
    turn(run, 390, 844);
    await run.ticks(5);
    turn(run, 844, 390);
    await run.tick(2);
    turn(run, 390, 844);
    await tapWhenUp(run, 'run.resume');
    await run.ticks(5);
    turn(run, 844, 390);
    await run.tick(2);
    expect(cover(run)).not.toBeNull();
    expect(run.game().paused).toBe(true);
  });

  it('draws the cover again once per size while the phone stays sideways', async () => {
    touchDevice();
    const run = await liveRun();
    turn(run, 844, 390);
    await run.tick(2);
    const first = cover(run)!;
    await run.tick(5);
    expect(cover(run)).toBe(first);
    turn(run, 932, 430);
    await run.tick(1);
    const second = cover(run)!;
    expect(first.destroyed).toBe(true);
    expect(second).not.toBe(first);
    await run.tick(5);
    expect(cover(run)).toBe(second);
    // only one cover on the stage
    expect(run.app.stage.children.filter((c) => c.children.some((k) => 'text' in k && k.text === rotate()))).toHaveLength(1);
  });

  it('a tablet on its side plays on in the 3:4 frame, no cover and no pause', async () => {
    touchDevice();
    const run = await liveRun();
    turn(run, 1024, 768);
    await run.ticks(30);
    expect(run.texts()).not.toContain(rotate());
    expect(run.game().paused).toBe(false);
  });

  it('a desktop window wider than tall is no phone: no cover', async () => {
    const run = await liveRun({ device: 'desktop' });
    turn(run, 844, 390);
    await run.ticks(30);
    expect(run.texts()).not.toContain(rotate());
    expect(run.game().paused).toBe(false);
  });

  it('in the lobby the cover shows and nothing pauses; turned back, the lobby takes taps again', async () => {
    touchDevice();
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()) });
    turn(rig, 390, 844);
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    turn(rig, 844, 390);
    await rig.tick(2);
    expect(cover(rig)).not.toBeNull();
    expect(rig.shell.place()).toBe('lobby');
    expect(rig.texts()).not.toContain(t('run.paused'));
    turn(rig, 390, 844);
    await rig.tick(2);
    expect(rig.texts()).not.toContain(rotate());
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    await rig.tick(2);
    expect(rig.shell.run!.paused).toBe(false);
    expect(rig.faults).toEqual([]);
  });
});
