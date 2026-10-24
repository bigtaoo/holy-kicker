/**
 * The whole shell, headless: the real Shell on a fake app, platform and offline backend, driven
 * frame by frame. Tests read the screens through the text in the tree and tap buttons by label.
 */
import { Container, Text, type Application } from 'pixi.js';
import { loadArt } from '../art';
import type { Art } from '../game/artTypes';
import { Backend } from '../net/backend';
import { BoardOutbox } from '../net/boardOutbox';
import { PrivacyChoice } from '../net/privacyChoice';
import { MemoryStore, SafeStore, SaveStore } from '../meta/saveStore';
import { newSave, type SaveData } from '../meta/save';
import { BALANCE } from '../meta/balance';
import { parseScene, type SceneOptions } from '../game/scene';
import { getLocale, t } from '../i18n';
import { Shell } from '../ui/Shell';
import type { Device } from '@hk/protocol';
import { fakePlatform, type FakeHost, type FakePlatform } from './fakePlatform';
import { fakeApp, installHeadless } from './headless';

/** One frame at 60 fps. */
const FRAME_MS = 1000 / 60;
/** The longest frame the ticker takes (its minFPS of 10). */
const LONG_FRAME_MS = 100;

let art: Promise<Art> | null = null;

export interface ShellRig {
  shell: Shell;
  app: Application;
  platform: FakePlatform;
  store: SaveStore;
  net: Backend;
  privacy: PrivacyChoice;
  /** Frames that threw (the shell recovers from them; a test should expect none). */
  faults: unknown[];
  /** Runs `n` frames of `ms` each (a 60 fps frame by default), letting promises settle between them. */
  tick(n?: number, ms?: number): Promise<void>;
  /** Runs frames until `done` holds; throws, listing what is on screen, after `max` frames. */
  until(done: () => boolean, max?: number): Promise<void>;
  /** Every text on the stage, top to bottom. */
  texts(): string[];
}

export interface RigOptions extends FakeHost {
  /** A query string as the dev switches would read it (`?wave=5`). */
  query?: string;
  /** The device's storage, to start from a save or a kept run. */
  storage?: MemoryStore;
  /** The device's time zone: Europe asks for consent first, elsewhere shares by default. */
  timeZone?: string;
  /** The kind of device: a desktop's run takes the keys on the cards and names them in its hints. */
  device?: Device;
}

/** Builds the shell the way boot.ts does, without starting it. */
export async function rigShell(o: RigOptions = {}): Promise<ShellRig> {
  installHeadless();
  const platform = fakePlatform(o, o.storage);
  const scene: SceneOptions = parseScene(o.query ?? '');
  art ??= loadArt(platform, parseScene(''), () => {}, false);
  const app = fakeApp();
  const net = new Backend(platform, null, 'test', getLocale, new BoardOutbox(new SafeStore(null)));
  const privacy = new PrivacyChoice(net, platform, 'http://hk.test', o.timeZone ?? 'America/New_York');
  const store = new SaveStore(platform.storage);
  const shell = new Shell(app, platform, await art, scene, store, net, o.device ?? 'mobile', privacy);
  const faults: unknown[] = [];
  shell.onFault = (err) => faults.push(err);
  let now = 0;
  const tick = async (n = 1, ms = FRAME_MS) => {
    for (let i = 0; i < n; i++) {
      await flush();
      // another driver may have stepped the ticker on (liveRun.ts): carry on from its clock
      now = Math.max(now, app.ticker.lastTime) + ms;
      app.ticker.update(now);
    }
    await settle();
  };
  // long frames (the ticker's cap): a wait of seconds in a few dozen frames
  const until = async (done: () => boolean, max = 100) => {
    for (let i = 0; i < max && !done(); i++) await tick(1, LONG_FRAME_MS);
    if (!done()) throw new Error(`still waiting after ${max} frames on ${shell.place()}: ${JSON.stringify(textsIn(app.stage))}`);
  };
  return { shell, app, platform, store, net, privacy, faults, tick, until, texts: () => textsIn(app.stage) };
}

/** Runs the promise jobs queued so far, and the ones they queue. */
function flush(): Promise<void> {
  return new Promise<void>((r) => setImmediate(r));
}

/** Lets pending promise chains (art loads, panels waiting on a record) and zero timers run to the end. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setTimeout(r, 0));
}

function visible(c: Container): boolean {
  for (let p: Container | null = c; p; p = p.parent) if (!p.visible || p.destroyed) return false;
  return true;
}

function walk(c: Container, out: Container[]): Container[] {
  out.push(c);
  for (const child of c.children) walk(child, out);
  return out;
}

/** The text of every visible Text under `root`. */
export function textsIn(root: Container): string[] {
  return walk(root, []).filter((c): c is Text => c instanceof Text && visible(c)).map((c) => c.text);
}

/**
 * Texts that look like i18n keys the tables do not have: `t()` gives the key back for a missing
 * one, so a dotted lowercase word left on screen is a hole in the tables.
 */
export function rawKeys(texts: string[]): string[] {
  return texts.filter((s) => /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/.test(s.trim()));
}

/** The visible interactive container named `label` or with a text under it reading `label`; the topmost one if several do. */
export function findTap(root: Container, label: string): Container | null {
  const hits = walk(root, []).filter((c) => (c.eventMode === 'static' || c.eventMode === 'dynamic') && visible(c) && (c.label === label || textsIn(c).some((s) => s === label)));
  // the innermost one carries the handler: a panel holding the button may be interactive too
  return hits.filter((c) => !hits.some((o) => o !== c && walk(c, []).includes(o))).pop() ?? null;
}

/** A tap on `c`: down, up and tap, the way a finger sends them. */
export function tap(c: Container): void {
  const e = { global: { x: 0, y: 0 }, stopPropagation() {}, preventDefault() {}, target: c, currentTarget: c };
  c.emit('pointerdown', e as never);
  c.emit('pointerup', e as never);
  c.emit('pointertap', e as never);
}

/** Taps the button reading `t(key)`; throws, listing what is on screen, when there is none. */
export function tapLabel(root: Container, key: string, vars?: Record<string, string | number>): void {
  const label = t(key as never, vars as never);
  const c = findTap(root, label);
  if (!c) throw new Error(`no button "${label}" on screen: ${JSON.stringify(textsIn(root))}`);
  tap(c);
}

/** A device whose storage holds `save`: a fresh save with `patch` over it. */
export function deviceWith(patch: Partial<SaveData> = {}): MemoryStore {
  const kv = new MemoryStore();
  new SaveStore(kv).save({ ...newSave(), ...patch });
  return kv;
}

/** A player who has cleared chapter 1 a few runs ago (the weekly challenge opens with it). */
export function clearedChapterOne(): Partial<SaveData> {
  const best = newSave().best;
  best[0] = BALANCE.waves;
  return { firstRunDone: true, cleared: 1, chapter: 2, runs: 3, level: 3, best };
}

/** Ends the current run as the engine would: the last wave beaten, or the hero down. */
export function endRun(rig: ShellRig, outcome: 'won' | 'lost'): void {
  const s = rig.shell.run!.engine.state;
  if (outcome === 'won') s.wave = s.config.waves;
  else s.players[0].hp = 0;
  s.outcome = outcome;
}

/** Waits for the control named `name` (an icon or a switch without words, the lobby's PLAY) to come up, then taps it. */
export async function tapNamed(rig: ShellRig, name: string): Promise<void> {
  await rig.until(() => findTap(rig.app.stage, name) !== null);
  tap(findTap(rig.app.stage, name)!);
}

/** Waits for the button reading `t(key)` to come up (screens build on the next frame, panels when their art is in), then taps it. */
export async function tapWhenUp(rig: ShellRig, key: string, vars?: Record<string, string | number>): Promise<void> {
  const label = t(key as never, vars as never);
  await rig.until(() => findTap(rig.app.stage, label) !== null);
  tap(findTap(rig.app.stage, label)!);
}
