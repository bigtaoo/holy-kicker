import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RUN, Engine, type SimEvent } from '@hk/engine';
import type { Game } from '../game/Game';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { RunPast } from '../meta/falls';
import type { Backend } from '../net/backend';
import type { Ads, Portal } from '../platform/types';
import type { RunHud } from './RunHud';
import { ALIVE_EVERY, RunWatch } from './runWatch';
import { TUTORIAL_MOVE } from './tutorial';

/** A HUD whose every method is a spy (RunWatch only calls them). */
function fakeHud(): RunHud & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const spies: Record<string, unknown> = { calls };
  return new Proxy(spies, {
    get: (target, key: string) => (target[key] ??= vi.fn((...args: unknown[]) => void (calls[key] ??= []).push(args))),
  }) as unknown as RunHud & { calls: Record<string, unknown[][]> };
}

function watch(teach: boolean, past?: RunPast, cam = { busy: false }, offer = { free: 0, ad: false }, steer = false, hold?: { reach(): boolean; start(): void }) {
  const game = { engine: new Engine({ ...DEFAULT_RUN, waves: 50, firstRun: teach }), paused: false, downCamBusy: () => cam.busy, pick: vi.fn() } as unknown as Game;
  const hud = fakeHud();
  const portal = { gameplayStart: vi.fn(), gameplayStop: vi.fn() } as unknown as Portal;
  const net = { track: vi.fn() } as unknown as Backend;
  const ads = { rewardedAvailable: () => Promise.resolve(offer.ad) } as unknown as Ads;
  const end = vi.fn();
  const w = new RunWatch(game, hud, { chapter: 1, portal, ads, net, past, freeRevives: () => offer.free, kills: () => 9, keepRun: vi.fn(), end, steer, hold }, teach);
  return { game, hud, net, w, end };
}

describe('RunWatch', () => {
  it('beats once a minute of play, not while paused, with where the run is', () => {
    const { game, net, w } = watch(false);
    const alive = () => vi.mocked(net.track).mock.calls.filter(([e]) => e === 'alive');
    for (let i = 0; i < ALIVE_EVERY - 1; i++) w.update(1);
    game.paused = true;
    for (let i = 0; i < 30; i++) w.update(1);
    expect(alive()).toHaveLength(0);
    game.paused = false;
    w.update(5); // a stalled frame counts as one second at most
    expect(alive()).toEqual([['alive', { chapter: 1, wave: 1, level: 1, kills: 9, card: false }]]);
  });

  it('starts a first run live, with the move hint up, whether or not the player gives input', () => {
    const { game, hud, w } = watch(true);
    expect(game.paused).toBe(false);
    expect(hud.calls.setTutorial?.[0]).toEqual(['move']);
    for (let i = 0; i < 60; i++) w.update(1 / 30);
    expect(game.paused).toBe(false);
    expect(w.tutorial?.step).toBe('move');
  });

  it('holds a desktop first run still while the keys cannot reach the game, and starts it once they can', () => {
    let reach = false;
    const start = vi.fn();
    const { game, net, w } = watch(true, undefined, undefined, undefined, false, { reach: () => reach, start: () => { start(); game.paused = false; } });
    expect(w.held).toBe(true);
    expect(game.paused).toBe(true);
    for (let i = 0; i < 30 * 10; i++) w.update(1 / 30);
    expect(start).not.toHaveBeenCalled();
    reach = true;
    w.update(1 / 30);
    expect([w.held, game.paused, start.mock.calls.length]).toEqual([false, false, 1]);
    // the held seconds are not the run's
    expect(vi.mocked(net.track).mock.calls.filter(([e]) => e === 'tutorial')).toEqual([['tutorial', { step: 'move', secs: 0 }]]);
  });

  it('lets a Resume start a held run, and holds neither a desktop whose keys reach nor a run that teaches nothing', () => {
    const start = vi.fn();
    const held = watch(true, undefined, undefined, undefined, false, { reach: () => false, start });
    held.game.paused = false;
    held.w.update(1 / 30);
    expect([held.w.held, start.mock.calls.length]).toEqual([false, 0]);
    expect(watch(true, undefined, undefined, undefined, false, { reach: () => true, start }).w.held).toBe(false);
    const replay = watch(false, undefined, undefined, undefined, false, { reach: () => false, start });
    expect([replay.w.held, replay.game.paused]).toEqual([false, false]);
  });

  it('moves the tutorial on once the hero has walked, and reports each step as it is reached', () => {
    const { game, net, w } = watch(true);
    const told = () => vi.mocked(net.track).mock.calls.filter(([e]) => e === 'tutorial').map(([, p]) => p);
    w.update(1 / 30);
    expect(told()).toEqual([{ step: 'move', secs: 0 }]);
    // standing still for a while, the pause panel left out of the run's seconds
    for (let i = 0; i < 30 * 4; i++) w.update(1 / 30);
    game.paused = true;
    w.update(20);
    game.paused = false;
    game.engine.state.players[0].moving = true;
    const frames = Math.ceil((TUTORIAL_MOVE * 30) + 1);
    for (let i = 0; i < frames; i++) w.update(1 / 30);
    expect(w.tutorial?.step).toBe('auto');
    for (let i = 0; i < 30 * 8; i++) w.update(1 / 30);
    expect(w.tutorial?.step).toBe('done');
    expect(told()).toEqual([{ step: 'move', secs: 0 }, { step: 'auto', secs: 5 }, { step: 'gems', secs: 8 }, { step: 'done', secs: 12 }]);
  });

  it("takes the first run's opening cards (the first, the one it steers to), then deals them once the player moved", () => {
    const { game, hud, w } = watch(true);
    const p = game.engine.state.players[0];
    for (let i = 0; i < BALANCE.firstRun.autoPicks; i++) {
      p.offer = [{ kind: 'passive', id: 'rice' }, { kind: 'spell', id: 'palm' }, { kind: 'spell', id: 'bolt' }];
      w.update(1 / 30);
      expect(game.pick).toHaveBeenLastCalledWith(0);
    }
    expect(hud.calls.gained).toHaveLength(BALANCE.firstRun.autoPicks);
    expect(hud.calls.showOffer).toBeUndefined();
    // before the player moved the first card is still taken
    p.offer = [{ kind: 'passive', id: 'iron' }, { kind: 'passive', id: 'eye' }, { kind: 'passive', id: 'rice' }];
    w.update(1 / 30);
    expect(game.pick).toHaveBeenLastCalledWith(0);
    // a shrine's choice is the player's
    p.offer = [{ kind: 'shrine', id: 'heal' }, { kind: 'shrine', id: 'insight' }];
    w.update(1 / 30);
    expect(hud.calls.showOffer).toHaveLength(1);
    p.offer = [];
    w.update(1 / 30);
    p.moving = true;
    for (let i = 0; i < Math.ceil(TUTORIAL_MOVE * 30) + 1; i++) w.update(1 / 30);
    expect(w.tutorial?.step).toBe('auto');
    p.offer = [{ kind: 'spell', id: 'bolt' }, { kind: 'spell', id: 'incense' }, { kind: 'spell', id: 'bell' }];
    w.update(1 / 30);
    expect(hud.calls.showOffer).toHaveLength(2);
    expect(game.pick).toHaveBeenCalledTimes(BALANCE.firstRun.autoPicks + 1);
  });

  it('deals every card on a later run', () => {
    const { game, hud, w } = watch(false);
    game.engine.state.players[0].offer = [{ kind: 'spell', id: 'palm' }, { kind: 'spell', id: 'bolt' }, { kind: 'spell', id: 'incense' }];
    w.update(1 / 30);
    expect(game.pick).not.toHaveBeenCalled();
    expect(hud.calls.showOffer).toHaveLength(1);
  });

  it("suggests the healing incense to a new player, the bot's card to anyone else", () => {
    const offer = () => [{ kind: 'spell', id: 'palm' }, { kind: 'spell', id: 'bolt' }, { kind: 'spell', id: 'incense' }];
    for (const [steer, card] of [[true, 2], [false, 0]] as const) {
      const { game, hud, w } = watch(false, undefined, undefined, undefined, steer);
      const p = game.engine.state.players[0];
      p.spells.push({ id: 'incense', level: 1, cd: 0, evolved: false }, { id: 'bolt', level: 1, cd: 0, evolved: false });
      p.offer = offer() as typeof p.offer;
      w.update(1 / 30);
      expect(hud.calls.showOffer[0][2]).toBe(card);
    }
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

  it('spins while the host is asked, then offers the ad revive only when it can play one, else ends the run', async () => {
    const a = watch(false, undefined, undefined, { free: 0, ad: true });
    fell(a.game, 1, 1, 1);
    a.w.update(1 / 30);
    expect(a.hud.calls.showDown?.[0][0]).toBe('checking');
    await Promise.resolve();
    expect(a.hud.calls.showDown?.[1][0]).toBe('ad');
    const b = watch(false, undefined, undefined, { free: 0, ad: false });
    fell(b.game, 1, 1, 1);
    b.w.update(1 / 30);
    await Promise.resolve();
    expect(b.hud.calls.showDown?.map((c) => c[0])).toEqual(['checking']);
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

  it('cheers a new record, louder than a broken-through fall, once the run clears more than the best', () => {
    const { game, hud, w } = watch(false, { best: 3, chests: 0, fell: 2 });
    const s = game.engine.state;
    for (const wave of [1, 2, 3, 4, 5, 6]) {
      s.wave = wave;
      w.update(1 / 30);
    }
    expect(hud.calls.announce?.map((c) => [c[3], c[4]])).toEqual([
      [null, false], [null, false], [t('run.brokeThrough'), false], [null, false], [t('run.newRecord'), true], [null, false],
    ]);
  });

  it('marks nothing on a run with no past fall', () => {
    const { game, hud, w } = watch(false);
    game.engine.state.wave = 1;
    w.update(1 / 30);
    expect(hud.calls.setLastFall).toEqual([[0]]);
  });
});
