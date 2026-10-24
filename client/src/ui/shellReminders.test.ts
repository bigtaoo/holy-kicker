import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { loadSettings } from '../meta/settings';
import { fakeIosShell, fakeOta, iosHost, type FakeIosShell } from '../testkit/iosHost';
import { clearedChapterOne, deviceWith, endRun, findTap, rigShell, tap, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';

// The iOS app's reminders as the player meets them (docs/ios.md "Reminders"): the real Shell and
// NativeNotifier over a faked shell bridge. They are booked again whenever the lobby opens and
// whenever the game goes to the background; the card is offered once, after a run and never on
// a launch; the settings switch turns them off and on; a refusal in the system's sheet leaves
// nothing booked and the switch replaced by where to undo it.

/** A player three runs in (enough to be asked), in the lobby, with no manifest to offer an update. */
async function lobby(shell: FakeIosShell): Promise<ShellRig> {
  const storage = deviceWith(clearedChapterOne());
  const rig = await rigShell({ storage, ...iosHost(shell, fakeOta({ manifest: null }), storage) });
  await rig.shell.start();
  await rig.until(() => rig.shell.place() === 'lobby');
  await rig.tick(2);
  return rig;
}

const carded = (rig: ShellRig) => rig.texts().includes(t('remind.offer', { patrol: t('patrol.title') }));

/** A run lost and given up, back to the lobby. */
async function aRun(rig: ShellRig): Promise<void> {
  await tapNamed(rig, 'play');
  await rig.until(() => rig.shell.place() === 'run');
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results' || rig.texts().includes(t('run.giveUp')));
  if (rig.shell.place() !== 'results') await tapWhenUp(rig, 'run.giveUp');
  await rig.until(() => rig.shell.place() === 'results');
  await rig.tick(30);
  const collect = rig.texts().find((x) => x.startsWith(t('results.collect', { n: 0 }).split('0')[0]));
  if (collect) await tapWhenUp(rig, 'results.collect', { n: Number(/\d+/.exec(collect)![0]) });
  else await tapWhenUp(rig, 'results.lobby');
  await rig.until(() => rig.shell.place() === 'lobby');
  await rig.tick(2);
}

async function openSettings(rig: ShellRig): Promise<void> {
  await tapNamed(rig, 'settings');
  await rig.until(() => rig.texts().includes(t('settings.title')));
}

/** Taps the reminders switch and lets the answer go through. */
async function flip(rig: ShellRig): Promise<void> {
  const c = findTap(rig.app.stage, 'reminders');
  if (!c) throw new Error(`no reminders switch: ${JSON.stringify(rig.texts())}`);
  tap(c);
  await rig.tick(3);
}

describe('the iOS reminders', () => {
  it('are booked when the lobby opens and again when the game goes to the background', async () => {
    const shell = fakeIosShell({ notify: 'on' });
    const rig = await lobby(shell);
    expect([...shell.booked.keys()].sort()).toEqual(['daily', 'patrol']);
    expect(shell.booked.get('patrol')?.title).toBe(t('remind.patrolTitle', { patrol: t('patrol.title') }));
    expect(shell.booked.get('daily')?.body).toBe(t('remind.dailyBody'));
    // the patrol rings once full, the daily at its hour, both in the future
    for (const r of shell.booked.values()) expect(r.at).toBeGreaterThan(Date.now());

    shell.booked.clear();
    rig.platform.hide();
    expect([...shell.booked.keys()].sort()).toEqual(['daily', 'patrol']);
    // already on: no card to ask about them
    expect(carded(rig)).toBe(false);
    expect(rig.faults).toEqual([]);
  });

  it('offers the card after a run, never on the launch, and a yes asks the system and books them', async () => {
    const shell = fakeIosShell({ notify: 'unknown' });
    const rig = await lobby(shell);
    expect(carded(rig)).toBe(false);
    // nothing rings before the system has said yes
    expect(shell.booked.size).toBe(0);

    await aRun(rig);
    expect(carded(rig)).toBe(true);
    await tapWhenUp(rig, 'remind.yes');
    expect(shell.calls).toEqual(['notifyAsk']);
    shell.answerNotify('on');
    await rig.until(() => !carded(rig));
    expect([...shell.booked.keys()].sort()).toEqual(['daily', 'patrol']);
    expect(loadSettings(rig.platform.storage)).toMatchObject({ remindAsked: true, reminders: true });

    // offered once
    await aRun(rig);
    expect(carded(rig)).toBe(false);
    expect(shell.calls).toEqual(['notifyAsk']);
    expect(rig.faults).toEqual([]);
  }, 30_000);

  it('a no on the card asks nothing, books nothing and is never offered again', async () => {
    const shell = fakeIosShell({ notify: 'unknown' });
    const rig = await lobby(shell);
    await aRun(rig);
    await tapWhenUp(rig, 'remind.no');
    await rig.until(() => !carded(rig));
    expect(shell.calls).toEqual([]);
    expect(loadSettings(rig.platform.storage)).toMatchObject({ remindAsked: true, reminders: false });
    await aRun(rig);
    expect(carded(rig)).toBe(false);
    expect(shell.booked.size).toBe(0);
    expect(rig.faults).toEqual([]);
  }, 30_000);

  it('refused in the system sheet: nothing booked, and settings says where to turn them on', async () => {
    const shell = fakeIosShell({ notify: 'unknown' });
    const rig = await lobby(shell);
    await aRun(rig);
    await tapWhenUp(rig, 'remind.yes');
    shell.answerNotify('off');
    await rig.until(() => !carded(rig));
    expect(shell.booked.size).toBe(0);
    rig.platform.hide();
    expect(shell.booked.size).toBe(0);

    await openSettings(rig);
    expect(rig.texts()).toContain(t('remind.blocked'));
    // a tap here cannot undo the phone's settings: no switch
    expect(findTap(rig.app.stage, 'reminders')).toBeNull();
    expect(rig.faults).toEqual([]);
  }, 30_000);

  it('the settings switch cancels them and books them again', async () => {
    const shell = fakeIosShell({ notify: 'on' });
    const rig = await lobby(shell);
    await openSettings(rig);
    expect(rig.texts()).toContain(t('remind.on'));

    await flip(rig);
    expect(rig.texts()).toContain(t('remind.off'));
    expect(shell.booked.size).toBe(0);
    expect(loadSettings(rig.platform.storage).reminders).toBe(false);
    // off stays off through a trip to the background
    rig.platform.hide();
    expect(shell.booked.size).toBe(0);

    await flip(rig);
    expect(rig.texts()).toContain(t('remind.on'));
    expect([...shell.booked.keys()].sort()).toEqual(['daily', 'patrol']);
    // the system had already said yes: no sheet
    expect(shell.calls).toEqual([]);
    expect(rig.faults).toEqual([]);
  });

  it('the switch turned on before the system was asked brings up its sheet', async () => {
    const shell = fakeIosShell({ notify: 'unknown' });
    const rig = await lobby(shell);
    await openSettings(rig);
    expect(rig.texts()).toContain(t('remind.off'));
    await flip(rig);
    expect(shell.calls).toEqual(['notifyAsk']);
    shell.answerNotify('on');
    await rig.until(() => rig.texts().includes(t('remind.on')));
    expect([...shell.booked.keys()].sort()).toEqual(['daily', 'patrol']);
    // asked from settings: the lobby's card is not offered any more
    expect(loadSettings(rig.platform.storage).remindAsked).toBe(true);
    expect(rig.faults).toEqual([]);
  });
});
