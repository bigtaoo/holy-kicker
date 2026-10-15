import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUN, Engine } from '@hk/engine';
import type { Game } from '../game/Game';
import type { Backend } from '../net/backend';
import type { Ads, Portal } from '../platform/types';
import type { RunHud } from './RunHud';
import { RunWatch } from './runWatch';
import { TUTORIAL_MOVE } from './tutorial';

/** A HUD whose every method is a spy (RunWatch only calls them). */
function fakeHud(): RunHud & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const spies: Record<string, unknown> = { calls };
  return new Proxy(spies, {
    get: (target, key: string) => (target[key] ??= vi.fn((...args: unknown[]) => void (calls[key] ??= []).push(args))),
  }) as unknown as RunHud & { calls: Record<string, unknown[][]> };
}

function watch(teach: boolean) {
  const game = { engine: new Engine({ ...DEFAULT_RUN, waves: 50, firstRun: teach }), paused: false } as unknown as Game;
  const hud = fakeHud();
  const portal = { gameplayStart: vi.fn(), gameplayStop: vi.fn() } as unknown as Portal;
  const net = { track: vi.fn() } as unknown as Backend;
  const w = new RunWatch(game, hud, { chapter: 1, portal, ads: {} as Ads, net, freeRevives: () => 0, keepRun: vi.fn(), end: vi.fn() }, teach);
  return { game, hud, net, w };
}

describe('RunWatch', () => {
  it('starts a first run live, with the move hint up, whether or not the player gives input', () => {
    const { game, hud, w } = watch(true);
    expect(game.paused).toBe(false);
    expect(hud.calls.setTutorial?.[0]).toEqual(['move']);
    for (let i = 0; i < 60; i++) w.update(1 / 30);
    expect(game.paused).toBe(false);
    expect(w.tutorial?.step).toBe('move');
  });

  it('moves the tutorial on once the hero has walked, and reports it when done', () => {
    const { game, net, w } = watch(true);
    game.engine.state.players[0].moving = true;
    const frames = Math.ceil((TUTORIAL_MOVE * 30) + 1);
    for (let i = 0; i < frames; i++) w.update(1 / 30);
    expect(w.tutorial?.step).toBe('auto');
    for (let i = 0; i < 30 * 8; i++) w.update(1 / 30);
    expect(w.tutorial?.step).toBe('done');
    expect(net.track).toHaveBeenCalledWith('tutorial');
  });

  it('teaches nothing on a later run', () => {
    const { game, hud, w } = watch(false);
    w.update(1 / 30);
    expect(w.tutorial).toBeNull();
    expect(hud.calls.setTutorial).toBeUndefined();
    expect(game.paused).toBe(false);
  });
});
