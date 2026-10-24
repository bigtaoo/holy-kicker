import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { loadSettings } from '../meta/settings';
import { clearedChapterOne, deviceWith, findTap, rigShell, tap, tapNamed, tapWhenUp, type RigOptions, type ShellRig } from '../testkit/testShell';

/** A player past the first run, on the lobby's settings panel. */
async function settings(o: RigOptions = {}): Promise<ShellRig> {
  const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), ...o });
  await rig.shell.start();
  await rig.until(() => rig.shell.place() === 'lobby');
  await tapNamed(rig, 'settings');
  await rig.until(() => rig.texts().includes(t('settings.title')));
  return rig;
}

/** Taps the control named or reading `label`, then waits for the panel drawn again. */
async function press(rig: ShellRig, label: string): Promise<void> {
  const c = findTap(rig.app.stage, label);
  if (!c) throw new Error(`no "${label}" on screen: ${JSON.stringify(rig.texts())}`);
  tap(c);
  await rig.tick(3);
}

describe('settings', () => {
  it('the screen shake switch, the music and the quality are kept on the device', async () => {
    const rig = await settings();
    const kv = rig.platform.storage;
    expect(loadSettings(kv).shake).toBe(true);
    expect(rig.texts()).toContain(t('settings.shakeOn'));
    await press(rig, 'shake');
    expect(loadSettings(kv).shake).toBe(false);
    expect(rig.texts()).toContain(t('settings.shakeOff'));

    const music = loadSettings(kv).music;
    await press(rig, '−'); // the music row's, the lower of the two
    expect(loadSettings(kv).music).toBe(music - 1);

    await press(rig, t('settings.saver'));
    expect(loadSettings(kv).quality).toBe('saver');
    await press(rig, t('settings.high'));
    expect(loadSettings(kv).quality).toBe('high');
    expect(rig.faults).toEqual([]);
  });

  it('the leaderboards switch stands apart from the stats consent', async () => {
    const rig = await settings({ timeZone: 'Europe/Berlin' });
    await tapWhenUp(rig, 'settings.account');
    await rig.until(() => rig.texts().includes(t('settings.dataNotice')));
    // in the consent region nothing is shared before the player says so; the boards are on all the same
    expect(rig.privacy.sharing()).toBe(false);
    expect(rig.privacy.boards()).toBe(true);
    expect(rig.texts()).toContain(t('settings.shareOff'));
    expect(rig.texts()).toContain(t('settings.boardsOn'));

    await press(rig, t('settings.boardsOn'));
    expect(rig.privacy.boards()).toBe(false);
    expect(rig.privacy.sharing()).toBe(false);
    expect(loadSettings(rig.platform.storage).boards).toBe(false);
    expect(rig.texts()).toContain(t('settings.boardsOff'));

    await press(rig, t('settings.shareOff'));
    expect(rig.privacy.sharing()).toBe(true);
    expect(rig.privacy.boards()).toBe(false); // sharing does not turn the boards back on
    expect(rig.texts()).toContain(t('settings.shareOn'));

    await press(rig, t('settings.shareOn'));
    await press(rig, t('settings.boardsOff'));
    expect(rig.privacy.sharing()).toBe(false);
    expect(rig.privacy.boards()).toBe(true); // nor does turning them on share the stats

    await press(rig, t('settings.policy'));
    expect(rig.platform.calls.some((c) => c.startsWith('open http://hk.test/privacy'))).toBe(true);
    await tapWhenUp(rig, 'common.back');
    await rig.until(() => rig.texts().includes(t('settings.title')));
    expect(rig.faults).toEqual([]);
  });

  it('outside the consent region the stats are shared by default, the boards still their own switch', async () => {
    const rig = await settings({ timeZone: 'America/New_York' });
    await tapWhenUp(rig, 'settings.account');
    await rig.until(() => rig.texts().includes(t('settings.boardsOn')));
    expect(rig.privacy.sharing()).toBe(true);
    await press(rig, t('settings.boardsOn'));
    expect(rig.privacy.sharing()).toBe(true);
    expect(rig.privacy.boards()).toBe(false);
  });
});
