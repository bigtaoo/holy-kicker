import { Text, type Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../meta/balance';
import { seasonOf } from '../meta/merit';
import { lobbyWaiting, tasksWaiting, waitingCount } from '../meta/waiting';
import { named, shown } from '../testkit/liveRun';
import { lobbyRig, openTab } from '../testkit/lobbyRig';
import type { ShellRig } from '../testkit/testShell';

/** What the badges on screen add up to: a plain one counts 1, a numbered one its number. */
function badged(rig: ShellRig): number[] {
  return (named(rig.app.stage, 'badge') as Container[]).filter(shown).map((b) => {
    const n = b.children.find((c): c is Text => c instanceof Text);
    return n ? Number(n.text) : 1;
  });
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

describe('the lobby badges', () => {
  it('add up to the count the results screen sends the player to collect, on every tab', async () => {
    const now = Date.now();
    const rig = await lobbyRig({
      // two merit steps (the Tasks button), two chests on chapter 1, copper for training,
      // a monk to buy (a dot of its own), today's free chest still in the Shop
      merit: { season: seasonOf(now), points: BALANCE.merit.steps[2].at, claimed: 1 },
      chests: [0b111], opened: [0b1], copper: 1e7,
    });
    const w = lobbyWaiting(rig.store.load(), Date.now());
    expect(w.merit).toBe(2);
    expect(w.chests).toBe(2);
    expect(w.shop && w.train).toBe(true);
    expect(sum(badged(rig))).toBe(waitingCount(w));
    // the Tasks button wears its count even with other red dots up: the one-dot rule used to hide it
    expect(badged(rig)).toContain(tasksWaiting(w));
    // (the Train tab open is its own marker: its buy button stands lit where the badge was)
    for (const tab of ['shop', 'gear']) {
      await openTab(rig, tab);
      expect(sum(badged(rig)), tab).toBe(waitingCount(lobbyWaiting(rig.store.load(), Date.now())));
    }
    expect(rig.faults).toEqual([]);
  });
});
