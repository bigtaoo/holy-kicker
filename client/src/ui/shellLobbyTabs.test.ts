import { Matrix, type Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Backend } from '../net/backend';
import type { PropValue } from '@hk/protocol';
import { named } from '../testkit/liveRun';
import { lobbyRig, openTab } from '../testkit/lobbyRig';
import type { ShellRig } from '../testkit/testShell';

/** The monk in the courtyard as the stage shows him: where his feet stand and how tall he is drawn. */
function figure(rig: ShellRig): { x: number; feet: number; height: number } {
  const [f] = named(rig.app.stage, 'lobbyFigure') as Container[];
  expect(f).toBeDefined();
  const m = f.getGlobalTransform(new Matrix(), false);
  return { x: m.tx, feet: m.ty, height: f.getBounds().height };
}

afterEach(() => vi.restoreAllMocks());

describe('the lobby tabs', () => {
  for (const device of ['mobile', 'desktop'] as const) {
    it(`keep the monk still between Play and Gear (${device})`, async () => {
      const rig = await lobbyRig({ level: 5 }, { device });
      const play = figure(rig);
      await openTab(rig, 'gear');
      expect(figure(rig)).toEqual(play);
      await openTab(rig, 'play');
      expect(figure(rig)).toEqual(play);
      expect(rig.faults).toEqual([]);
    });
  }

  it('name the tab on screen when the game goes away from the lobby', async () => {
    let leave: (() => Record<string, PropValue>) | null = null;
    vi.spyOn(Backend.prototype, 'onLeave').mockImplementation((props) => void (leave = props));
    const rig = await lobbyRig({ level: 5 });
    expect(leave!()).toMatchObject({ place: 'lobby', tab: 'play' });
    await openTab(rig, 'gear');
    expect(leave!()).toMatchObject({ place: 'lobby', tab: 'gear' });
  });
});
