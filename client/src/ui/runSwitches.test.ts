import type { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { loadSettings, updateSettings, VOLUME_STEPS } from '../meta/settings';
import { MemoryStore } from '../meta/saveStore';
import { clearedChapterOne, deviceWith, tap, tapNamed, tapWhenUp, textsIn } from '../testkit/testShell';
import { liveRun, untilOffer, type LiveOptions, type LiveRun } from '../testkit/liveRun';
import type { Switch } from './pausePanel';

// The in-run pause panel's switches (pausePanel.ts runSwitches) through the real shell: what they
// set on the sound and the run, what they keep on the device, and that it lasts past the run.

/** The interactive switch in the cell headed by the switch's name; null when the panel lists no such switch. */
function switchOf(run: LiveRun, s: Switch): Container | null {
  const name = t(`run.switch.${s}`);
  let hit: Container | null = null;
  const walk = (c: Container) => {
    if (!hit && textsIn(c).length === 1 && textsIn(c)[0] === name) {
      const knob = c.children.find((k) => k.eventMode === 'static');
      if (knob) hit = knob;
    }
    c.children.forEach(walk);
  };
  walk(run.app.stage);
  return hit;
}

async function flip(run: LiveRun, s: Switch): Promise<void> {
  const c = switchOf(run, s);
  if (!c) throw new Error(`no "${s}" switch on screen: ${JSON.stringify(run.texts())}`);
  tap(c);
  await run.tick(2);
}

/** A live run on the pause panel. */
async function paused(o: LiveOptions = {}): Promise<LiveRun> {
  const run = await liveRun(o);
  await run.ticks(5);
  await tapNamed(run, 'II');
  await run.until(() => run.texts().includes(t('run.paused')));
  return run;
}

/** Gives up the run on the panel and comes back to the lobby. */
async function leave(run: LiveRun): Promise<void> {
  await tapWhenUp(run, 'run.giveUp');
  await tapWhenUp(run, 'run.giveUpConfirm');
  await run.until(() => run.shell.place() === 'results');
}

/** A device holding a player past chapter 1, with settings `s`. */
function withSettings(s: Parameters<typeof updateSettings>[1]): MemoryStore {
  const kv = deviceWith(clearedChapterOne());
  updateSettings(kv, s);
  return kv;
}

describe('the pause panel switches', () => {
  it('turn the music and effects off to 0 and on again to the level they had, kept on the device', async () => {
    const kv = withSettings({ music: 3, volume: 2 });
    const run = await paused({ storage: kv });
    expect(run.shell.sound.musicLevel).toBe(3);
    await flip(run, 'music');
    expect(run.shell.sound.musicLevel).toBe(0);
    expect(loadSettings(kv).music).toBe(0);
    await flip(run, 'music');
    expect(run.shell.sound.musicLevel).toBe(3);
    expect(loadSettings(kv).music).toBe(3);

    await flip(run, 'effects');
    expect(run.shell.sound.level).toBe(0);
    expect(loadSettings(kv).volume).toBe(0);
    await flip(run, 'effects');
    expect(run.shell.sound.level).toBe(2);
    expect(loadSettings(kv).volume).toBe(2);
    expect(run.faults).toEqual([]);
  });

  it('turn shake off on the run and on the device', async () => {
    const run = await paused();
    const kv = run.platform.storage;
    expect(run.game().shake.on).toBe(true);
    await flip(run, 'shake');
    expect(run.game().shake.on).toBe(false);
    expect(loadSettings(kv).shake).toBe(false);
    await flip(run, 'shake');
    expect(run.game().shake.on).toBe(true);
    expect(loadSettings(kv).shake).toBe(true);
  });

  it('list vibration only where the phone can buzz, and keep it', async () => {
    const bare = await paused();
    expect(switchOf(bare, 'shake')).not.toBeNull();
    expect(switchOf(bare, 'haptics')).toBeNull();

    const run = await paused({ vibrate: true });
    const kv = run.platform.storage;
    expect(loadSettings(kv).haptics).toBe(true);
    await flip(run, 'haptics');
    expect(loadSettings(kv).haptics).toBe(false);
    await flip(run, 'haptics');
    expect(loadSettings(kv).haptics).toBe(true);
  });

  it('with vibration off the phone stays still on a level-up', async () => {
    const run = await paused({ vibrate: true });
    await flip(run, 'haptics');
    await tapWhenUp(run, 'run.resume');
    run.steer('bot');
    await untilOffer(run);
    expect(run.platform.calls.filter((c) => c.startsWith('vibrate'))).toEqual([]);

    const buzzing = await liveRun({ vibrate: true });
    buzzing.steer('bot');
    await untilOffer(buzzing);
    expect(buzzing.platform.calls).toContain('vibrate');
  });

  it('carry over to the next run and to a fresh shell on the same device', async () => {
    const run = await paused({ vibrate: true });
    const kv = run.platform.storage as MemoryStore;
    await flip(run, 'music');
    await flip(run, 'effects');
    await flip(run, 'shake');
    await flip(run, 'haptics');
    await leave(run);
    // the next run in the same shell
    await tapWhenUp(run, 'results.again');
    await run.until(() => run.shell.place() === 'run');
    await run.tick(2);
    expect(run.game().shake.on).toBe(false);
    await tapNamed(run, 'II');
    await run.until(() => run.texts().includes(t('run.paused')));
    for (const s of ['music', 'effects', 'shake', 'haptics'] as const) expect(switchOf(run, s), s).not.toBeNull();

    // a fresh shell on the device
    const next = await paused({ storage: kv, vibrate: true });
    expect(next.shell.sound.musicLevel).toBe(0);
    expect(next.shell.sound.level).toBe(0);
    expect(next.game().shake.on).toBe(false);
    expect(loadSettings(kv)).toMatchObject({ music: 0, volume: 0, shake: false, haptics: false });
  });

  it('a switch turned off in one run comes back on at the level it had, not the top step', async () => {
    const kv = withSettings({ music: 2, volume: 3 });
    const run = await paused({ storage: kv });
    await flip(run, 'music');
    await flip(run, 'effects');
    await leave(run);

    const next = await paused({ storage: kv });
    await flip(next, 'music');
    await flip(next, 'effects');
    expect(next.shell.sound.musicLevel).toBe(2);
    expect(next.shell.sound.level).toBe(3);
    expect(loadSettings(kv)).toMatchObject({ music: 2, volume: 3 });
    expect(VOLUME_STEPS).toBeGreaterThan(3); // the top step would pass the test by chance
  });
});

describe('the fast-forward toggle', () => {
  it('doubles the run, is kept on the device, and the next run and a fresh shell start fast', async () => {
    const run = await liveRun();
    const kv = run.platform.storage as MemoryStore;
    expect(run.game().speed).toBe(1);
    await tapNamed(run, 'fast');
    await run.tick(1);
    expect(run.game().speed).toBe(2);
    expect(loadSettings(kv).fast).toBe(true);
    // two sim ticks for each tick-long frame
    const at = run.sim().tick;
    await run.ticks(20);
    expect(run.sim().tick - at).toBeLessThan(30);

    await tapNamed(run, 'II');
    await leave(run);
    await tapWhenUp(run, 'results.again');
    await run.until(() => run.shell.place() === 'run');
    expect(run.game().speed).toBe(2);

    const next = await liveRun({ storage: kv });
    expect(next.game().speed).toBe(2);
    await tapNamed(next, 'fast');
    await next.tick(1);
    expect(next.game().speed).toBe(1);
    expect(loadSettings(kv).fast).toBe(false);
  });
});
