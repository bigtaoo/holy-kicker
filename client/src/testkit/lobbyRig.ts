/**
 * The lobby's economy, headless: a shell opened on a seeded save, taps that land where a finger
 * would (the topmost control under the point, so a panel over the lobby takes a second tap on a
 * button it covers), a rewarded ad the test finishes or fails, and the top bar's currencies.
 */
import 'pixi.js/events'; // the interaction mixin Pixi's hit test reads (a browser build adds it itself)
import { EventBoundary, Matrix, Point, Text, type Container } from 'pixi.js';
import type { MemoryStore } from '../meta/saveStore';
import type { SaveData } from '../meta/save';
import type { Ads } from '../platform/types';
import { t } from '../i18n';
import { clearedChapterOne, deviceWith, findTap, rigShell, textsIn, type RigOptions, type ShellRig } from './testShell';

/** A shell over `storage` (or a cleared-chapter-one save with `patch`), started and in the lobby. */
export async function lobbyRig(patch: Partial<SaveData> = {}, o: RigOptions = {}): Promise<ShellRig> {
  const rig = await rigShell({ storage: deviceWith({ ...clearedChapterOne(), ...patch }), ...o });
  await rig.shell.start();
  await rig.until(() => rig.shell.place() === 'lobby');
  await rig.tick(2);
  return rig;
}

/** The game opened again on the same device: a new shell over the storage `rig` saved to. */
export async function reload(rig: ShellRig, o: RigOptions = {}): Promise<ShellRig> {
  const next = await rigShell({ ...o, storage: rig.platform.storage as MemoryStore });
  await next.shell.start();
  await next.until(() => next.shell.place() === 'lobby');
  await next.tick(2);
  return next;
}

export interface FakeAds extends Ads {
  /** Ads asked for so far. */
  plays: number;
  /** Ends the ad playing now: watched to the end (true) or closed early (false). */
  finish(paid: boolean): void;
}

/** A rewarded ad that is always offered and plays until the test ends it with `finish`. */
export function fakeAds(): FakeAds {
  const waiting: ((paid: boolean) => void)[] = [];
  const ads: FakeAds = {
    plays: 0,
    rewardedAvailable: async () => true,
    rewarded: (started) => {
      ads.plays++;
      started?.();
      return new Promise<boolean>((r) => waiting.push(r));
    },
    midgame: async () => {},
    adFree: () => false,
    finish: (paid) => {
      const r = waiting.shift();
      if (!r) throw new Error('no ad is playing');
      r(paid);
    },
  };
  return ads;
}

/** Where a finger taps `c`: on its words (or its middle without any), in stage coordinates. */
export function spotOf(c: Container): Point {
  const words = all(c).find((n): n is Text => n instanceof Text && n.text !== '');
  const b = (words ?? c).getBounds();
  return new Point(b.x + b.width / 2, b.y + b.height / 2);
}

/**
 * A finger tap on `at` (or on the control `at`): delivered to whatever is topmost there (Pixi's own
 * hit test) and bubbled up from it, so a backdrop over a button takes the tap instead.
 */
export function tapAt(stage: Container, at: Container | Point): void {
  const { x, y } = at instanceof Point ? at : spotOf(at);
  const target = new FreshBoundary(stage).hitTest(x, y);
  if (!target) return;
  for (const type of ['pointerdown', 'pointerup', 'pointertap']) {
    let stopped = false;
    const e = { type, global: { x, y }, target, stopPropagation: () => (stopped = true), preventDefault() {}, currentTarget: target };
    for (let n: Container | null = target; n && !stopped; n = n.parent) {
      e.currentTarget = n;
      n.emit(type as never, e as never);
    }
  }
}

/**
 * Pixi's hit test with each transform worked out on the spot: it reads the world transforms a
 * render leaves behind, and a headless app never renders.
 */
class FreshBoundary extends EventBoundary {
  override hitPruneFn(c: Container, at: Point): boolean {
    if (c.hitArea && !c.hitArea.contains(...local(c, at))) return true;
    return false;
  }

  override hitTestFn(c: Container, at: Point): boolean {
    if (c.hitArea) return true;
    const p = local(c, at);
    // a Graphics or a Sprite knows its own shape; a bare Container has none
    const shaped = c as Container & { containsPoint?: (at: Point) => boolean };
    return shaped.containsPoint?.(new Point(...p)) ?? false;
  }
}

function local(c: Container, at: Point): [number, number] {
  const p = c.getGlobalTransform(new Matrix(), false).applyInverse(at, new Point());
  return [p.x, p.y];
}

/** Finds the button reading `t(key)`; throws, listing what is on screen, when there is none. */
export function button(rig: ShellRig, key: string, vars?: Record<string, string | number>): Container {
  const text = t(key as never, vars as never);
  const c = findTap(rig.app.stage, text);
  if (!c) throw new Error(`no button "${text}" on screen: ${JSON.stringify(rig.texts())}`);
  return c;
}

/**
 * The button reading `label` that sits nearest a text reading `near` (on the same card): the
 * shop's free and ad chests both read Open.
 */
export function buttonNear(rig: ShellRig, label: string, near: string): Container {
  let best: Container | null = null;
  let bestDepth = Infinity;
  for (const c of tappables(rig.app.stage, label)) {
    let depth = 0;
    for (let p = c.parent; p; p = p.parent, depth++) {
      if (textsIn(p).includes(near)) break;
    }
    if (depth < bestDepth) [best, bestDepth] = [c, depth];
  }
  if (!best) throw new Error(`no button "${label}" near "${near}": ${JSON.stringify(rig.texts())}`);
  return best;
}

function tappables(root: Container, label: string): Container[] {
  const out: Container[] = [];
  const visit = (c: Container) => {
    if (!c.visible || c.destroyed) return;
    if ((c.eventMode === 'static' || c.eventMode === 'dynamic') && textsIn(c).includes(label)) out.push(c);
    for (const child of c.children) visit(child);
  };
  visit(root);
  // the innermost ones carry the handlers
  return out.filter((c) => !out.some((o) => o !== c && o.parent && isUnder(o, c)));
}

function isUnder(c: Container, root: Container): boolean {
  for (let p: Container | null = c.parent; p; p = p.parent) if (p === root) return true;
  return false;
}

/** A finger tap on the button reading `t(key)`, then a few frames for the lobby to redraw. */
export async function press(rig: ShellRig, key: string, vars?: Record<string, string | number>): Promise<void> {
  tapAt(rig.app.stage, button(rig, key, vars));
  await rig.tick(2);
}

/** Two taps on the same spot before the lobby redraws, the way an impatient thumb sends them. */
export async function doubleTap(rig: ShellRig, c: Container): Promise<void> {
  const at = spotOf(c);
  tapAt(rig.app.stage, at);
  tapAt(rig.app.stage, at);
  await rig.tick(2);
}

/** The top bar's jade and copper as it shows them: the two amounts right of the player's name. */
export function wallet(rig: ShellRig): { jade: string; copper: string } {
  const top = rig.app.screen.height * 0.08;
  const amounts = all(rig.app.stage)
    .filter((c): c is Text => c instanceof Text && /^\d[\d.,]*[kKmM]?$/.test(c.text) && c.getBounds().y < top)
    .sort((a, b) => b.getBounds().x - a.getBounds().x);
  if (amounts.length < 2) throw new Error(`no currencies in the top bar: ${JSON.stringify(rig.texts())}`);
  return { jade: amounts[0].text, copper: amounts[1].text };
}

function all(c: Container, out: Container[] = []): Container[] {
  if (!c.visible || c.destroyed) return out;
  out.push(c);
  for (const child of c.children) all(child, out);
  return out;
}

/** Selects the bottom tab named `t('tab.<tab>')`. */
export async function openTab(rig: ShellRig, tab: string): Promise<void> {
  await press(rig, `tab.${tab}`);
}

/** Every text on screen with its no-break spaces as plain ones (the shop keeps "3 gear" on one line with them). */
export function words(rig: ShellRig): string[] {
  return rig.texts().map((s) => s.replace(/ /g, ' '));
}
