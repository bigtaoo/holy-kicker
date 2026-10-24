import { Point, Text, type Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { emptyInventory, mergeCost, type Inventory, type ItemId, type Tier } from '../meta/gear';
import { unlockedRelics } from '../meta/unlocks';
import { buttonNear, doubleTap, lobbyRig, openTab, reload, tapAt, wallet, words } from '../testkit/lobbyRig';
import type { ShellRig } from '../testkit/testShell';
import { dropName, itemName, tierName } from './gearText';

const N = BALANCE.gear.mergeCount;

function gearWith(counts: Partial<Record<ItemId, number[]>>): Inventory {
  const inv = emptyInventory();
  for (const [id, c] of Object.entries(counts)) c.forEach((n, i) => (inv[id as ItemId][i] = n));
  inv.ball[0] = Math.max(1, inv.ball[0]);
  inv.staff[0] = Math.max(1, inv.staff[0]);
  return inv;
}

/** Opens the gear panel of `item` from the paper doll. */
async function openSlot(rig: ShellRig, item: ItemId): Promise<void> {
  tapAt(rig.app.stage, buttonNear(rig, itemName(item), itemName(item)));
  await rig.tick(2);
}

/** The Merge button on the row of tier `tier` in the open gear panel. */
function mergeButton(rig: ShellRig, tier: Tier): Container {
  return buttonNear(rig, `${t('gear.merge')}  ${formatAmount(mergeCost(tier))}`, tierName(tier));
}

/** Taps through the merge's show until it closes. */
async function skipShow(rig: ShellRig): Promise<void> {
  const mid = new Point(rig.app.screen.width / 2, rig.app.screen.height / 2);
  for (let i = 0; i < 10 && rig.texts().includes(t('gear.tap')); i++) {
    tapAt(rig.app.stage, mid);
    await rig.tick(3);
  }
  expect(rig.texts()).not.toContain(t('gear.tap'));
}

describe('gear, tapped through', { timeout: 30_000 }, () => {
  it('merges five alike into the next tier once per double tap, and the panel shows the new counts', async () => {
    const rig = await lobbyRig({ copper: 1000, gear: gearWith({ pendant: [N + 1] }) });
    await openTab(rig, 'gear');
    await openSlot(rig, 'pendant');
    expect(words(rig)).toContain(`${N + 1}/${N}`);
    await doubleTap(rig, mergeButton(rig, 0));
    const save = rig.store.load();
    expect(save.gear.pendant.slice(0, 2)).toEqual([1, 1]);
    expect(save.copper).toBe(1000 - mergeCost(0));
    // the show names what came of it
    expect(words(rig)).toContain(dropName({ item: 'pendant', tier: 1 }));
    await skipShow(rig);
    expect(words(rig)).toContain(`1/${N}`);
    expect(wallet(rig).copper).toBe(formatAmount(1000 - mergeCost(0)));
    const again = await reload(rig);
    expect(again.store.load().gear.pendant.slice(0, 2)).toEqual([1, 1]);
    expect(wallet(again).copper).toBe(formatAmount(1000 - mergeCost(0)));
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('refuses a merge the copper does not cover, with a toast and nothing spent', async () => {
    const short = mergeCost(0) - 1;
    const rig = await lobbyRig({ copper: short, gear: gearWith({ robe: [N] }) });
    await openTab(rig, 'gear');
    await openSlot(rig, 'robe');
    await doubleTap(rig, mergeButton(rig, 0));
    expect(words(rig)).toContain(t('gear.noCopper'));
    expect(words(rig)).not.toContain(t('gear.tap'));
    const save = rig.store.load();
    expect(save.copper).toBe(short);
    expect(save.gear.robe[0]).toBe(N);
    expect(rig.faults).toEqual([]);
  });

  it('merges everything the copper allows with Merge all, lowest tiers first', async () => {
    const copper = 3 * mergeCost(0) + 50;
    const rig = await lobbyRig({ copper, gear: gearWith({ pendant: [2 * N], bracers: [N, N - 1] }) });
    await openTab(rig, 'gear');
    await doubleTap(rig, buttonNear(rig, t('gear.mergeAll'), t('gear.mergeAll')));
    const save = rig.store.load();
    expect(save.gear.pendant.slice(0, 2)).toEqual([0, 2]);
    // the bracers' merge fills tier 1 to five, but the copper is gone by then
    expect(save.gear.bracers.slice(0, 2)).toEqual([0, N]);
    expect(save.copper).toBe(50);
    expect(words(rig)).toContain(t('gear.merged', { n: 3 }));
    await skipShow(rig);
    // nothing more can merge for 50 copper: the tab explains merging instead
    expect(words(rig)).not.toContain(t('gear.mergeAll'));
    const again = await reload(rig);
    await openTab(again, 'gear');
    expect(again.store.load().copper).toBe(50);
    expect(words(again)).not.toContain(t('gear.mergeAll'));
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });

  it('wears the relic tapped on the Play tab, kept after a reload', async () => {
    const rig = await lobbyRig();
    const save = rig.store.load();
    expect(save.relic).toBe('ball');
    const open = unlockedRelics(save);
    expect(open).toContain('staff');
    const head = `${t('lobby.relic')}: ${t('relic.ball.name')}`;
    const row = findText(rig.app.stage, head)!.parent!;
    const badges = row.children.filter((c) => c.eventMode === 'static');
    tapAt(rig.app.stage, badges[open.indexOf('staff')]);
    await rig.tick(3);
    expect(rig.store.load().relic).toBe('staff');
    expect(words(rig)).toContain(`${t('lobby.relic')}: ${t('relic.staff.name')}`);
    const again = await reload(rig);
    expect(again.store.load().relic).toBe('staff');
    expect(words(again)).toContain(`${t('lobby.relic')}: ${t('relic.staff.name')}`);
    expect([...rig.faults, ...again.faults]).toEqual([]);
  });
});

function findText(root: Container, text: string): Text | null {
  if (root instanceof Text && root.text === text) return root;
  for (const c of root.children) {
    const hit = findText(c, text);
    if (hit) return hit;
  }
  return null;
}
