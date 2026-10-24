import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { MemoryStore } from '../meta/saveStore';
import { REVOKE_KEY } from '../platform/ios/ota';
import { fakeIosShell, fakeOta, iosHost, newer, type FakeOta } from '../testkit/iosHost';
import { clearedChapterOne, deviceWith, endRun, rigShell, tapLabel, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';

// The iOS app's hot update as the player meets it (docs/ios.md "Hot updates"): the real Shell
// over the real OTA code (findOta, installOta), with the plugin and the manifest faked. The
// prompt comes only over a free lobby; Update shows the download's bar and ends in the switch
// that restarts the game; Later and a failure leave the running bundle in play.

/** A player past chapter 1 in the lobby; reminders already on, so no card is offered after a run. */
async function lobby(ota: FakeOta, storage: MemoryStore = deviceWith(clearedChapterOne()), shell = fakeIosShell({ notify: 'on' })): Promise<ShellRig> {
  const rig = await rigShell({ storage, ...iosHost(shell, ota, storage) });
  await rig.shell.start();
  await rig.until(() => rig.shell.place() === 'lobby');
  return rig;
}

const offered = (rig: ShellRig) => rig.texts().includes(t('update.title'));

/** Back to the lobby from a lost run: past the revive offer, then the results' way out. */
async function leaveResults(rig: ShellRig): Promise<void> {
  await rig.until(() => rig.shell.place() === 'results' || rig.texts().includes(t('run.giveUp')));
  if (rig.shell.place() !== 'results') {
    await tapWhenUp(rig, 'run.giveUp');
    await rig.until(() => rig.shell.place() === 'results');
  }
  await rig.tick(30);
  const collect = rig.texts().find((x) => x.startsWith(t('results.collect', { n: 0 }).split('0')[0]));
  if (collect) tapLabel(rig.app.stage, 'results.collect', { n: Number(/\d+/.exec(collect)![0]) });
  else tapLabel(rig.app.stage, 'results.lobby');
  await rig.until(() => rig.shell.place() === 'lobby');
}

describe('the hot update prompt', () => {
  it('asks over a free lobby, then Update shows the bar and switches to the new bundle', async () => {
    const ota = fakeOta();
    const rig = await lobby(ota);
    await rig.until(() => offered(rig));
    expect(ota.checks).toBe(1);
    expect(rig.texts()).toContain(t('update.version', { v: '1.0.22.2' }));

    await tapWhenUp(rig, 'update.now');
    await rig.until(() => rig.texts().includes(t('update.downloading')));
    expect(ota.calls).toEqual(['download 1.0.22.2']);
    expect(rig.texts()).toContain(t('update.percent', { n: '0' }));
    ota.percent(40);
    await rig.until(() => rig.texts().includes(t('update.percent', { n: '40' })));
    // no button while it downloads: nothing can be tapped through to the lobby's
    expect(rig.texts()).not.toContain(t('update.later'));

    ota.downloaded();
    await rig.until(() => rig.texts().includes(t('update.restarting')));
    expect(rig.texts()).toContain(t('update.percent', { n: '100' }));
    // the switch to the downloaded bundle is what restarts the page into it
    expect(ota.calls).toEqual(['download 1.0.22.2', 'set b7']);
    expect(rig.faults).toEqual([]);
  });

  it('never asks mid-run: an offer found during a run waits for the lobby', async () => {
    const ota = fakeOta();
    const release = ota.hold();
    const rig = await lobby(ota);
    await rig.until(() => ota.checks === 1);
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    release();
    await rig.tick(30);
    expect(offered(rig)).toBe(false);
    endRun(rig, 'lost');
    await leaveResults(rig);
    await rig.until(() => offered(rig));
    expect(ota.checks).toBe(1);
    expect(rig.faults).toEqual([]);
  }, 30_000);

  it('a trip to the background mid-run drops the offer found, and the lobby checks again', async () => {
    const ota = fakeOta();
    const release = ota.hold();
    const rig = await lobby(ota);
    await rig.until(() => ota.checks === 1);
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    release();
    await rig.tick(5);
    rig.platform.hide();
    // the kept run waits on its pause panel; the player gives it up for the lobby
    await tapWhenUp(rig, 'run.giveUp');
    await tapWhenUp(rig, 'run.giveUpConfirm');
    await leaveResults(rig);
    await rig.until(() => offered(rig));
    expect(ota.checks).toBe(2);
    expect(rig.faults).toEqual([]);
  }, 30_000);

  it('Later drops the offer until the game comes back from the background', async () => {
    const ota = fakeOta();
    const rig = await lobby(ota);
    await rig.until(() => offered(rig));
    await tapWhenUp(rig, 'update.later');
    await rig.tick(30);
    expect(offered(rig)).toBe(false);
    expect(ota.checks).toBe(1);
    expect(ota.calls).toEqual([]);

    rig.platform.hide();
    await rig.until(() => offered(rig));
    expect(ota.checks).toBe(2);
    expect(rig.faults).toEqual([]);
  });

  it('a failed download offers Retry, which downloads again, or Close', async () => {
    const ota = fakeOta();
    const rig = await lobby(ota);
    await rig.until(() => offered(rig));
    await tapWhenUp(rig, 'update.now');
    ota.percent(60);
    ota.failed();
    await rig.until(() => rig.texts().includes(t('update.failedTitle')));
    expect(rig.texts()).toContain(t('update.failed'));
    expect(ota.calls).toEqual(['download 1.0.22.2']);

    await tapWhenUp(rig, 'update.retry');
    await rig.until(() => rig.texts().includes(t('update.downloading')));
    // the bar starts again from nothing
    expect(rig.texts()).toContain(t('update.percent', { n: '0' }));
    expect(ota.calls).toEqual(['download 1.0.22.2', 'download 1.0.22.2']);
    ota.failed();
    await rig.until(() => rig.texts().includes(t('update.failedTitle')));
    await tapWhenUp(rig, 'update.close');
    await rig.tick(30);
    expect(rig.texts()).not.toContain(t('update.failedTitle'));
    expect(ota.calls.filter((c) => c.startsWith('set'))).toEqual([]);
    expect(rig.faults).toEqual([]);
  });

  it('waits under the reminder card after a run until it is answered', async () => {
    const ota = fakeOta();
    const release = ota.hold();
    const rig = await lobby(ota, undefined, fakeIosShell({ notify: 'unknown' }));
    await rig.until(() => ota.checks === 1);
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    release();
    endRun(rig, 'lost');
    await leaveResults(rig);
    await rig.until(() => rig.texts().includes(t('remind.no')));
    await rig.tick(30);
    expect(offered(rig)).toBe(false);
    await tapWhenUp(rig, 'remind.no');
    await rig.until(() => offered(rig));
    expect(rig.faults).toEqual([]);
  }, 30_000);

  it('asks nothing when the manifest stops the rollout, revokes the bundle, needs a newer bridge, or is out of reach', async () => {
    const next = newer('1.0.22.1');
    const cases = [
      { ...next, stop: true },
      { ...next, revoke: [next.version] },
      { ...next, minBridge: 7 },
      { ...next, minNativeVersion: '1.1' },
      null,
    ];
    for (const manifest of cases) {
      const storage = deviceWith(clearedChapterOne());
      const ota = fakeOta({ manifest });
      const rig = await lobby(ota, storage);
      await rig.until(() => ota.checks === 1);
      await rig.tick(30);
      expect(offered(rig), JSON.stringify(manifest)).toBe(false);
      expect(rig.faults).toEqual([]);
      // the next launch acts on what the manifest takes back
      if (manifest?.revoke) expect(storage.getItem(REVOKE_KEY)).toBe(JSON.stringify([next.version]));
    }
    // the same bundle on a shell whose bridge is new enough is offered
    const ota = fakeOta({ manifest: { ...next, minBridge: 6 } });
    const rig = await lobby(ota);
    await rig.until(() => offered(rig));
  });
});
