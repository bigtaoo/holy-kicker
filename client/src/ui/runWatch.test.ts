import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUN, Engine, type SimEvent } from '@hk/engine';
import type { Game } from '../game/Game';
import { t } from '../i18n';
import type { RunPast } from '../meta/falls';
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

function watch(teach: boolean, past?: RunPast, cam = { busy: false }, offer = { free: 0, ad: false }) {
  const game = { engine: new Engine({ ...DEFAULT_RUN, waves: 50, firstRun: teach }), paused: false, downCamBusy: () => cam.busy } as unknown as Game;
  const hud = fakeHud();
  const portal = { gameplayStart: vi.fn(), gameplayStop: vi.fn() } as unknown as Portal;
  const net = { track: vi.fn() } as unknown as Backend;
  const ads = { rewardedAvailable: () => Promise.resolve(offer.ad) } as unknown as Ads;
  const end = vi.fn();
  const w = new RunWatch(game, hud, { chapter: 1, portal, ads, net, past, freeRevives: () => offer.free, keepRun: vi.fn(), end }, teach);
  return { game, hud, net, w, end };
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

  /** Fells the hero on `wave` at `level`, with no revive left unless `revives` says so. */
  function fell(game: Game, wave: number, level = 1, revives = 0): void {
    const s = game.engine.state;
    s.wave = wave;
    s.outcome = 'lost';
    s.players[0].dead = true;
    s.players[0].revives = revives;
    s.players[0].level = level;
  }

  const blow = (src: 'bullet' | 'slam', owner = 0, value = 5): SimEvent => ({ type: 'hurt', owner, value, src, x: 0, y: 0 });

  it('goes straight to the results with no revive left, knowing what dealt the last blow', () => {
    const { game, hud, w, end } = watch(false);
    w.see([blow('slam'), blow('bullet')]);
    // blows to another hero, or ones that dealt nothing, do not count
    w.see([blow('slam', 1), blow('slam', 0, 0)]);
    fell(game, 1);
    w.update(1 / 30);
    expect(w.fall?.cause).toBe('bullet');
    expect(end).toHaveBeenCalledTimes(1);
    expect(hud.calls.showDown).toBeUndefined();
  });

  it('offers a free revive from training on the death panel, with the cause', () => {
    const { game, hud, w, end } = watch(false, undefined, undefined, { free: 1, ad: false });
    fell(game, 1, 1, 1);
    w.update(1 / 30);
    expect(hud.calls.showDown).toEqual([['free', expect.objectContaining({ cause: 'crowd' })]]);
    expect(end).not.toHaveBeenCalled();
  });

  it('offers the ad revive only when the host can play one, else ends the run', async () => {
    const a = watch(false, undefined, undefined, { free: 0, ad: true });
    fell(a.game, 1, 1, 1);
    a.w.update(1 / 30);
    await Promise.resolve();
    expect(a.hud.calls.showDown?.[0][0]).toBe('ad');
    const b = watch(false, undefined, undefined, { free: 0, ad: false });
    fell(b.game, 1, 1, 1);
    b.w.update(1 / 30);
    await Promise.resolve();
    expect(b.hud.calls.showDown).toBeUndefined();
    expect(b.end).toHaveBeenCalledTimes(1);
  });

  it('blames the horde when no blow was seen, and too few levels whatever the blow', () => {
    const a = watch(false);
    fell(a.game, 1);
    a.w.update(1 / 30);
    expect(a.w.fall?.cause).toBe('crowd');
    const b = watch(false);
    b.w.see([blow('bullet')]);
    fell(b.game, 30, 1);
    b.w.update(1 / 30);
    expect(b.w.fall?.cause).toBe('level');
  });

  it('holds the end of the run back while the kill cam runs', () => {
    const cam = { busy: true };
    const { game, w, end } = watch(false, undefined, cam);
    fell(game, 1);
    w.update(1 / 30);
    expect(end).not.toHaveBeenCalled();
    expect(w.downShown).toBe(false);
    cam.busy = false;
    w.update(1 / 30);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('measures the fall against the chapter past: the nearest goal', () => {
    const { game, w } = watch(false, { best: 0, chests: 0, fell: 0 });
    fell(game, 49);
    w.update(1 / 30);
    expect(w.fall).toEqual(expect.objectContaining({ goal: { kind: 'clear', wave: 50, n: 2 } }));
  });

  it('marks the last fall until the run gets past it, and cheers that wave', () => {
    const { game, hud, w } = watch(false, { best: 0, chests: 0, fell: 3 });
    const s = game.engine.state;
    for (const wave of [1, 2, 3, 4, 5]) {
      s.wave = wave;
      w.update(1 / 30);
    }
    expect(hud.calls.setLastFall?.map((c) => c[0])).toEqual([3, 3, 3, 0, 0]);
    expect(hud.calls.announce?.map((c) => c[3])).toEqual([null, null, null, t('run.brokeThrough'), null]);
  });

  it('marks nothing on a run with no past fall', () => {
    const { game, hud, w } = watch(false);
    game.engine.state.wave = 1;
    w.update(1 / 30);
    expect(hud.calls.setLastFall).toEqual([[0]]);
  });
});
