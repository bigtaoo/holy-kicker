import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { lobbyRig } from '../testkit/lobbyRig';
import { tapWhenUp } from '../testkit/testShell';

// The new-record wave banner in a run, on the real Shell: passing the chapter's best waves
// cleared cheers louder than any other wave.

describe('the new-record banner', () => {
  it("cheers the wave that passes the chapter's best, with its burst", async () => {
    // chapter 2's best: 3 waves cleared
    const best = [50, 3, ...Array(18).fill(0)];
    const rig = await lobbyRig({ best });
    await tapWhenUp(rig, 'lobby.play');
    await rig.until(() => rig.shell.place() === 'run');
    await rig.tick(3);
    const s = rig.shell.run!.engine.state;
    s.wave = 5; // 4 waves cleared: past the best
    await rig.until(() => rig.texts().includes(t('run.newRecord')));
    // the burst plays out over the banner's frames
    await rig.tick(60);
    expect(rig.faults).toEqual([]);
  });
});
