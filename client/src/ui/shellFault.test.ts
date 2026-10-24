import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { loadRun } from '../meta/resume';
import { NO_PORTAL, type Ads, type Portal } from '../platform/types';
import { liveRun, type LiveRun } from '../testkit/liveRun';
import { clearedChapterOne, deviceWith, endRun, rigShell, tapWhenUp, type ShellRig } from '../testkit/testShell';
import { RECOVER_GAP_MS, REPORT_GAP_MS, RESTART_GAP_MS, STRIKE_MS, STRIKES } from './faultGuard';
import { LobbyScreen } from './LobbyScreen';
import { ResumeScreen } from './ResumeScreen';
import type { RunFlow } from './runFlow';
import type { Screen } from './uiLayout';

// The safety net for a frame that throws (Shell.fault, ui/faultGuard.ts), through the real shell:
// a fault is injected into a view's update inside Shell.frame and the shell's way back is read off
// the screen, the save and the host's calls.

/** The shell's insides the fault path works on. */
interface ShellInside {
  runs: RunFlow;
  screen: Screen | null;
  challenge: { capture: (...a: unknown[]) => unknown };
}
const inside = (rig: ShellRig) => rig.shell as unknown as ShellInside;

// FaultGuard reads Date.now as the shell is built: the clock is the test's from before then on
let clock = 0;
const later = (ms: number) => (clock += ms);

beforeEach(() => {
  clock = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  // the faults are logged; the test reads them off rig.faults instead
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const boom = (n: number) => new Error(`boom ${n}`);
let thrown = 0;

/** The run's view throws once on the next frame (the HUD's update, under the run watch). */
async function faultInRun(rig: ShellRig): Promise<Error> {
  const watch = inside(rig).runs.watch!;
  const update = watch.update;
  const err = boom(++thrown);
  watch.update = () => {
    watch.update = update;
    throw err;
  };
  await rig.tick(1);
  return err;
}

/** The screen on show throws once on the next frame (the lobby's update, say). */
async function faultOnScreen(rig: ShellRig): Promise<Error> {
  const screen = inside(rig).screen!;
  const update = screen.update;
  const err = boom(++thrown);
  screen.update = () => {
    screen.update = update;
    throw err;
  };
  await rig.tick(1);
  return err;
}

/** Records the portal's gameplay brackets. */
function portalLog(): { calls: string[]; portal: Portal } {
  const calls: string[] = [];
  return { calls, portal: { ...NO_PORTAL, gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop') } };
}

/** A chapter 2 run a few seconds in, its stick held still. */
async function aRun(o: Parameters<typeof liveRun>[0] = {}): Promise<LiveRun> {
  const run = await liveRun(o);
  await run.ticks(60);
  return run;
}

describe('a fault in a run', { timeout: 30_000 }, () => {
  it('the first keeps the run and offers it; going on plays from the same tick', async () => {
    const p = portalLog();
    const run = await aRun({ portal: p.portal });
    const tick = run.sim().tick;
    const wave = run.sim().wave;
    const err = await faultInRun(run);
    expect(run.faults).toEqual([err]);
    expect(run.shell.run).toBeNull();
    expect(inside(run).screen).toBeInstanceOf(ResumeScreen);
    await run.until(() => run.texts().includes(t('run.unfinished')));
    expect(loadRun(run.platform.storage)?.state.tick).toBe(tick);
    // the shelved run is off screen: the portal hears it stop
    expect(p.calls).toEqual(['start', 'stop']);
    // and nothing was settled
    const runs = run.store.load().runs;
    await tapWhenUp(run, 'common.continue');
    await run.until(() => run.shell.place() === 'run');
    expect(run.sim().tick).toBe(tick);
    expect(run.sim().wave).toBe(wave);
    expect(run.store.load().runs).toBe(runs);
    // the resumed fight waits on the pause panel; once let go it plays on
    expect(p.calls).toEqual(['start', 'stop', 'start', 'stop']);
    await tapWhenUp(run, 'run.resume');
    expect(p.calls.at(-1)).toBe('start');
    await run.ticks(30);
    expect(run.sim().tick).toBeGreaterThanOrEqual(tick + 30);
  });

  it('a second one in the resumed run settles it like a give-up, on to its results', async () => {
    const run = await aRun();
    const runs = run.store.load().runs;
    const first = await faultInRun(run);
    await tapWhenUp(run, 'common.continue');
    await run.until(() => run.shell.place() === 'run');
    later(RECOVER_GAP_MS + 1);
    await faultInRun(run);
    await run.until(() => run.shell.place() === 'results');
    expect(run.shell.run).toBeNull();
    expect(run.store.load().runs).toBe(runs + 1);
    expect(loadRun(run.platform.storage)).toBeNull();
    // within REPORT_GAP_MS of the first, the second goes unreported
    expect(run.faults).toEqual([first]);
  });

  it('a new run after the faulted one starts with a clean slate: its first fault is offered again', async () => {
    const run = await aRun();
    await faultInRun(run);
    await tapWhenUp(run, 'run.giveUp');
    await run.until(() => run.shell.place() === 'results');
    await tapWhenUp(run, 'results.again');
    await run.until(() => run.shell.place() === 'run');
    await run.tick(3);
    later(REPORT_GAP_MS);
    const err = await faultInRun(run);
    expect(inside(run).screen).toBeInstanceOf(ResumeScreen);
    expect(run.faults.at(-1)).toBe(err);
  });

  it('a run never kept (the sandbox) is settled at once', async () => {
    const run = await aRun({ query: '?direct&waves=0' });
    const err = await faultInRun(run);
    expect(run.faults).toEqual([err]);
    expect(run.shell.run).toBeNull();
    await run.until(() => run.shell.place() === 'results');
    expect(loadRun(run.platform.storage)).toBeNull();
  });

  it('a challenge run is never kept either: settled to its own results, never offered', async () => {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), query: '?challenge' });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await tapWhenUp(rig, 'challenge.tile');
    await tapWhenUp(rig, 'lobby.play');
    await rig.until(() => rig.shell.place() === 'run');
    await rig.tick(30);
    await faultInRun(rig);
    await rig.until(() => rig.texts().includes(t('challenge.title')));
    expect(rig.shell.place()).toBe('results');
    expect(loadRun(rig.platform.storage)).toBeNull();
  });

  // a fault in the moment between the last blow and the results once offered a won run as unfinished
  it('a run already won goes on to its results, paid as a win', async () => {
    const run = await aRun();
    const runs = run.store.load().runs;
    endRun(run, 'won');
    await faultInRun(run);
    expect(inside(run).screen).not.toBeInstanceOf(ResumeScreen);
    await run.until(() => run.shell.place() === 'results');
    expect(run.store.load().runs).toBe(runs + 1);
    expect(run.store.load().cleared).toBe(2);
    expect(loadRun(run.platform.storage)).toBeNull();
  });

  it('a hero down with no revive left goes on to the results', async () => {
    const run = await aRun();
    endRun(run, 'lost');
    run.sim().players[0].revives = 0;
    await faultInRun(run);
    expect(inside(run).screen).not.toBeInstanceOf(ResumeScreen);
    await run.until(() => run.shell.place() === 'results');
    expect(loadRun(run.platform.storage)).toBeNull();
  });

  it('a hero down with a revive left is offered, and comes back down to the revive still to take', async () => {
    // the revive is the rewarded ad's: a host that has one
    const ads: Ads = { rewardedAvailable: async () => true, rewarded: async () => false, midgame: async () => {}, adFree: () => false };
    const run = await aRun({ ads });
    endRun(run, 'lost');
    const revives = run.sim().players[0].revives;
    expect(revives).toBeGreaterThan(0);
    await faultInRun(run);
    expect(inside(run).screen).toBeInstanceOf(ResumeScreen);
    await tapWhenUp(run, 'common.continue');
    await run.until(() => run.shell.place() === 'run');
    expect(run.sim().outcome).toBe('lost');
    expect(run.sim().players[0].revives).toBe(revives);
    await run.until(() => run.texts().includes(t('run.revive')));
  });

  it('a won run kept as the game went to the background is settled on the next launch, not offered', async () => {
    const run = await aRun();
    endRun(run, 'won');
    run.platform.hide();
    expect(loadRun(run.platform.storage)?.state.outcome).toBe('won');
    const next = await rigShell({ storage: run.platform.storage as never });
    await next.shell.start();
    await next.until(() => next.shell.place() === 'results');
    expect(next.store.load().cleared).toBe(2);
    expect(loadRun(next.platform.storage)).toBeNull();
  });

  it('dropped when settling throws: off screen, the portal told, and a fresh lobby', async () => {
    const p = portalLog();
    const run = await aRun({ query: '?direct&waves=0', portal: p.portal });
    const game = run.game();
    const destroy = vi.spyOn(game, 'destroy');
    inside(run).challenge.capture = () => {
      throw new Error('no replay');
    };
    await faultInRun(run);
    expect(run.shell.run).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
    expect(p.calls).toEqual(['start', 'stop']);
    await run.until(() => run.shell.place() === 'lobby');
    // the dropped run no longer ticks
    const tick = game.engine.state.tick;
    await run.tick(10, 100);
    expect(game.engine.state.tick).toBe(tick);
  });

  it('dropped even when the run will not come down: whatever it holds goes with the page', async () => {
    const run = await aRun({ query: '?direct&waves=0' });
    inside(run).challenge.capture = () => {
      throw new Error('no replay');
    };
    run.game().destroy = () => {
      throw new Error('half built');
    };
    await faultInRun(run);
    expect(run.shell.run).toBeNull();
    await run.until(() => run.shell.place() === 'lobby');
  });
});

describe('a fault outside a run', { timeout: 30_000 }, () => {
  async function lobby(): Promise<ShellRig> {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()) });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await rig.tick(3);
    return rig;
  }

  it('puts up a fresh lobby', async () => {
    const rig = await lobby();
    const before = inside(rig).screen;
    const err = await faultOnScreen(rig);
    expect(rig.faults).toEqual([err]);
    expect(inside(rig).screen).toBeInstanceOf(LobbyScreen);
    expect(inside(rig).screen).not.toBe(before);
    await rig.tick(3);
    expect(rig.texts().length).toBeGreaterThan(0);
  });

  it('a fault right after a recovery waits for the new screen rather than tearing it down', async () => {
    const rig = await lobby();
    await faultOnScreen(rig);
    const fresh = inside(rig).screen;
    later(RECOVER_GAP_MS - 1);
    await faultOnScreen(rig);
    expect(inside(rig).screen).toBe(fresh);
  });

  it('a recovery that throws is logged and left to the next fault', async () => {
    const rig = await lobby();
    const shell = rig.shell as unknown as { showLobby: () => void };
    const show = shell.showLobby;
    shell.showLobby = () => {
      shell.showLobby = show;
      throw new Error('no lobby');
    };
    await faultOnScreen(rig);
    expect(console.error).toHaveBeenCalledWith(new Error('no lobby'));
    later(RECOVER_GAP_MS);
    const before = inside(rig).screen;
    await faultOnScreen(rig);
    expect(inside(rig).screen).toBeInstanceOf(LobbyScreen);
    expect(inside(rig).screen).not.toBe(before);
  });

  it('a report that throws does not stop the recovery', async () => {
    const rig = await lobby();
    rig.shell.onFault = () => {
      throw new Error('offline');
    };
    const before = inside(rig).screen;
    await faultOnScreen(rig);
    expect(inside(rig).screen).not.toBe(before);
  });
});

describe('faults that keep coming', { timeout: 30_000 }, () => {
  /** sessionStorage as a browser keeps it across a reload. */
  function browserPage(): { reload: ReturnType<typeof vi.fn>; session: Map<string, string> } {
    const reload = vi.fn();
    const session = new Map<string, string>();
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v) });
    return { reload, session };
  }

  async function lobby(): Promise<ShellRig> {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()) });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    return rig;
  }

  /** `n` faults, each after the recovery gap. */
  async function strikes(rig: ShellRig, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      later(RECOVER_GAP_MS);
      await faultOnScreen(rig);
    }
  }

  it('restart the page once recoveries stop helping, and report one fault per REPORT_GAP_MS', async () => {
    const page = browserPage();
    const rig = await lobby();
    await strikes(rig, STRIKES - 1);
    expect(page.reload).not.toHaveBeenCalled();
    await strikes(rig, 1);
    expect(page.reload).toHaveBeenCalledOnce();
    expect(Number(page.session.get('hk:faultRestart'))).toBe(clock);
    // a burst inside REPORT_GAP_MS is one report
    expect(rig.faults).toHaveLength(1);
    later(REPORT_GAP_MS);
    await strikes(rig, 1);
    expect(rig.faults).toHaveLength(2);
  });

  it('restart only once: the page that just restarted rests, then recovers again', async () => {
    const page = browserPage();
    // the page restarted itself a moment ago
    page.session.set('hk:faultRestart', String(clock));
    const rig = await lobby();
    await strikes(rig, STRIKES);
    expect(page.reload).not.toHaveBeenCalled();
    // resting: the screen stays as it is
    const resting = inside(rig).screen;
    await strikes(rig, 1);
    expect(inside(rig).screen).toBe(resting);
    later(STRIKE_MS);
    await strikes(rig, 1);
    expect(inside(rig).screen).not.toBe(resting);
    expect(inside(rig).screen).toBeInstanceOf(LobbyScreen);
  });

  it('a restart long ago does not hold the next one back', async () => {
    const page = browserPage();
    page.session.set('hk:faultRestart', String(clock - RESTART_GAP_MS));
    const rig = await lobby();
    await strikes(rig, STRIKES);
    expect(page.reload).toHaveBeenCalledOnce();
  });

  it('a host without reload (WeChat) never restarts, and a broken sessionStorage restarts all the same', async () => {
    const rig = await lobby();
    await strikes(rig, STRIKES);
    expect(rig.faults).toHaveLength(1);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    later(STRIKE_MS);
    await strikes(rig, STRIKES);
    expect(reload).toHaveBeenCalledOnce();
  });
});
