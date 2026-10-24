import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from './boot';
import { parseScene } from './game/scene';
import { t } from './i18n';
import { EXPERIMENTS } from './meta/experiments';
import { newSave, type SaveData } from './meta/save';
import { MemoryStore, SAVE_KEY, SaveStore } from './meta/saveStore';
import { SETTINGS_KEY } from './meta/settings';
import { AnomalyStash } from './net/anomalyStash';
import { Backend } from './net/backend';
import { OUTBOX_KEY } from './net/boardOutbox';
import { CLOUD_KEY } from './net/cloudSync';
import { BootTrail } from './platform/ios/bootTrail';
import type { Platform } from './platform/types';
import { Shell } from './ui/Shell';
import { bootGlobals, fakeServer, slotWith } from './testkit/bootRig';
import { fakePlatform } from './testkit/fakePlatform';
import { settle, textsIn } from './testkit/testShell';

// boot.ts end to end on the fake platform and app, against a fake backend: the order of what it
// sets going, on a first launch and a later one, and where the experiment arm comes from.

const TABLE = { ...EXPERIMENTS };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const id of Object.keys(EXPERIMENTS)) delete EXPERIMENTS[id];
  Object.assign(EXPERIMENTS, TABLE);
});

/** Puts `label` (made from the call's arguments and `this`) in `log` on each call of `proto[name]`, then runs it. */
function trace<T extends object>(log: string[], proto: T, name: keyof T, say: (self: never, ...args: never[]) => string) {
  const orig = proto[name] as (...a: unknown[]) => unknown;
  vi.spyOn(proto, name as never).mockImplementation(function (this: unknown, ...args: unknown[]) {
    log.push(say(this as never, ...(args as never[])));
    return orig.apply(this, args);
  } as never);
}

/** What the order tests follow: the traced calls and the backend's calls, less the shell's own fetches (records, replays). */
const ORDERED = /^(sharing|boards|save|arm|shell|perf|POST \/v1\/(runs|cloud|events)|GET \/v1\/beacon)/;

interface RigOptions {
  storage?: MemoryStore;
  country?: string;
  host?: Platform['host'];
}

function rig(o: RigOptions = {}) {
  const log: string[] = [];
  const server = fakeServer(log);
  const page = bootGlobals(server);
  const storage = o.storage ?? new MemoryStore();
  const platform = Object.assign(fakePlatform({ country: o.country ?? 'US' }, storage), { host: o.host ?? 'web' });
  trace(log, Backend.prototype, 'setSharing', (_, s: string) => `sharing ${s}`);
  trace(log, Backend.prototype, 'setBoards', (_, on: boolean) => `boards ${on ? 'on' : 'off'}`);
  trace(log, Backend.prototype, 'tag', (_, exp: string) => `arm ${exp || '-'}`);
  trace(log, SaveStore.prototype, 'load', () => 'save load');
  trace(log, Shell.prototype, 'reloadSave', () => 'save reload');
  trace(log, Shell.prototype, 'start', (shell: Shell) => `shell start, perf ${shell.perf ? 'on' : 'off'}`);
  const stages: string[] = [];
  const go = async (stage?: (s: string, info?: string) => void) => {
    const r = await boot(platform, parseScene(''), {
      skipDetections: true,
      stage: (s, info) => {
        stages.push(s);
        if (s === 'started') log.push('shell started');
        stage?.(s, info);
      },
    });
    await settle();
    return r;
  };
  return { log, ordered: () => log.filter((l) => ORDERED.test(l)), server, page, platform, storage, stages, go };
}

const played = (over: Partial<SaveData> = {}): SaveData => ({ ...newSave(), firstRunDone: true, runs: 10, cleared: 1, chapter: 2, ...over });

/** A device that has played, shared its data, and keeps a cloud slot holding `cloud`. */
function returning(cloud: SaveData, local = played({ copper: 5 })) {
  const kv = new MemoryStore();
  kv.setItem(SAVE_KEY, JSON.stringify(local));
  kv.setItem(SETTINGS_KEY, JSON.stringify({ dataSharing: 'yes' }));
  const r = rig({ storage: kv });
  kv.setItem(CLOUD_KEY, slotWith(r.server, cloud));
  return r;
}

/** A board run the last session sent and never heard back about (net/boardOutbox.ts). */
const unsent = { chapter: 1, hard: false, game: 'monk', wave: 30, tenths: 1000, kills: 5 };

const stored = (kv: MemoryStore) => new SaveStore(kv).load();

/** `first20` enrolling on the web, and a roll that gives the `short` arm. */
function experimentOn(): void {
  EXPERIMENTS.first20 = { note: '', hosts: ['web', 'ios'], arms: { control: 1, short: 1 } };
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
}

describe('boot order', () => {
  it('a first launch: the privacy answer, the save, the arm, the first run, then the cloud slot it makes', async () => {
    const r = rig();
    const { shell, cloud } = await r.go();
    expect(r.ordered()).toEqual([
      'sharing send',
      'boards on',
      'save load',
      'arm -',
      'shell start, perf on',
      'shell started',
      'GET /v1/beacon',
      // the first run is on: the pass makes the slot and leaves the save alone under it
      'POST /v1/cloud/new',
      'POST /v1/cloud/read',
    ]);
    expect(r.stages).toEqual(['probe', 'app', 'gl', 'art', 'shell', 'start', 'started']);
    expect(shell.place()).toBe('run');
    expect(cloud).not.toBeNull();
  });

  it('puts up the one-time privacy notice outside the consent region', async () => {
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, JSON.stringify(played()));
    const asked = rig({ storage: kv });
    const { app } = await asked.go();
    app.ticker.update(1000);
    expect(textsIn(app.stage)).toContain(t('privacy.toast'));
  });

  it('no notice for a player who answered', async () => {
    const { app } = await returning(played()).go();
    app.ticker.update(1000);
    expect(textsIn(app.stage)).not.toContain(t('privacy.toast'));
  });

  it('a later launch: board runs left unsent go first, the cloud save is merged once the lobby is up', async () => {
    const r = returning(played({ runs: 20, copper: 999 }));
    r.page.setItem(OUTBOX_KEY, JSON.stringify([unsent]));
    const { shell } = await r.go();
    expect(r.ordered()).toEqual([
      'sharing send',
      'boards on',
      'POST /v1/runs',
      'save load',
      'arm -',
      'shell start, perf on',
      'shell started',
      'GET /v1/beacon',
      'POST /v1/cloud/read',
      'save reload',
      'save load',
      'arm -',
      'POST /v1/cloud/write',
    ]);
    expect(shell.place()).toBe('lobby');
    expect(JSON.parse(r.page.getItem(OUTBOX_KEY)!)).toEqual([]);
    expect(stored(r.storage)).toMatchObject({ runs: 20, copper: 999 });
  });

  it('holds everything in the consent region until the player answers', async () => {
    const r = rig({ country: 'DE' });
    r.page.setItem(OUTBOX_KEY, JSON.stringify([unsent]));
    const { app } = await r.go();
    expect(r.ordered().slice(0, 2)).toEqual(['sharing hold', 'boards on']);
    r.platform.hide();
    await settle();
    expect(r.server.batches).toEqual([]);
    app.ticker.update(1000);
    expect(textsIn(app.stage)).not.toContain(t('privacy.toast'));
  });

  it('drops the unsent board runs of a player who turned the boards off', async () => {
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, JSON.stringify(played()));
    kv.setItem(SETTINGS_KEY, JSON.stringify({ dataSharing: 'yes', boards: false }));
    const r = rig({ storage: kv });
    r.page.setItem(OUTBOX_KEY, JSON.stringify([unsent]));
    await r.go();
    expect(r.ordered().slice(0, 2)).toEqual(['sharing send', 'boards off']);
    expect(r.log).not.toContain('POST /v1/runs');
    expect(JSON.parse(r.page.getItem(OUTBOX_KEY)!)).toEqual([]);
  });

  it('keeps no cloud save of its own where the host keeps the save', async () => {
    const r = rig({ host: 'crazygames' });
    const { cloud } = await r.go();
    expect(cloud).toBeNull();
    expect(r.log.some((l) => l.includes('/v1/cloud/'))).toBe(false);
  });

  it('as the game goes away: the leave event and a cloud pass, at most once a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const r = returning(played({ runs: 20 }));
    await r.go();
    r.log.length = 0;
    r.platform.hide();
    await settle();
    expect(r.server.batches.flatMap((b) => b.events.map((e) => e.e))).toContain('leave');
    expect(r.log).not.toContain('POST /v1/cloud/read');
    vi.setSystemTime(Date.now() + 61_000);
    r.platform.hide();
    await settle();
    expect(r.log).toContain('POST /v1/cloud/read');
  });
});

describe('the experiment arm and the cloud save', () => {
  it('takes the arm of the cloud save another install made, not one rolled for the empty save here', async () => {
    experimentOn();
    const kv = new MemoryStore();
    const r = rig({ storage: kv });
    kv.setItem(CLOUD_KEY, slotWith(r.server, played({ runs: 30, arms: { first20: 'control' } })));
    const { shell } = await r.go();
    expect(r.ordered()).toEqual([
      'sharing send',
      'boards on',
      'save load',
      'POST /v1/cloud/read',
      'POST /v1/cloud/write',
      'save load',
      'arm first20:control',
      'shell start, perf on',
      'shell started',
      'GET /v1/beacon',
    ]);
    expect(stored(kv).arms).toEqual({ first20: 'control' });
    // the player is back: the lobby, not a first run, and every event of the session says `control`
    expect(shell.place()).toBe('lobby');
    r.platform.hide();
    await settle();
    expect(r.server.batches.length).toBeGreaterThan(0);
    expect(r.server.batches.map((b) => b.exp)).toEqual(r.server.batches.map(() => 'first20:control'));
  });

  it('keeps out a player whose cloud save played before the experiment', async () => {
    experimentOn();
    const kv = new MemoryStore();
    const r = rig({ storage: kv });
    kv.setItem(CLOUD_KEY, slotWith(r.server, played({ runs: 30 })));
    await r.go();
    expect(r.log).not.toContain('arm first20:short');
    expect(stored(kv).arms).toEqual({ first20: '' });
  });

  it('rolls the arm for a new player once the empty slot it made is merged', async () => {
    experimentOn();
    const r = rig();
    const { shell } = await r.go();
    expect(r.ordered().slice(2, 8)).toEqual(['save load', 'POST /v1/cloud/new', 'POST /v1/cloud/read', 'POST /v1/cloud/write', 'save load', 'arm first20:short']);
    expect(stored(r.storage).arms).toEqual({ first20: 'short' });
    expect(shell.place()).toBe('run');
  });

  it('does not wait on the cloud for a player already in the experiment or past it', async () => {
    experimentOn();
    const r = returning(played({ runs: 20 }), played({ arms: { first20: 'short' } }));
    await r.go();
    expect(r.ordered().indexOf('POST /v1/cloud/read')).toBeGreaterThan(r.ordered().indexOf('shell started'));
  });

  it('starts within the 4 s cap when the backend never answers and the font never comes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    experimentOn();
    const r = rig();
    r.server.hang = true;
    r.platform.loadFont = () => new Promise(() => {});
    let done = false;
    const booting = r.go().then((b) => ((done = true), b));
    let ms = 0;
    while (!done && ms < 10_000) {
      await vi.advanceTimersByTimeAsync(50);
      ms += 50;
    }
    expect(done).toBe(true);
    expect(ms).toBeGreaterThanOrEqual(4000);
    expect(ms).toBeLessThanOrEqual(4100);
    // no merged save came: the arm is rolled on the device's own
    expect(r.log).toContain('arm first20:short');
    expect((await booting).shell.place()).toBe('run');
  });
});

describe('the iOS boot trail', () => {
  /** localStorage as the trail uses it. */
  const trailStore = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };

  it('follows the boot to `started`, and a launch marked done leaves nothing for the next to report', async () => {
    const kv = trailStore();
    const trail = new BootTrail(kv, 'b1', 'build', () => 0);
    const r = rig({ host: 'ios' });
    const { cloud } = await r.go((s, info) => trail.step(s, info));
    expect(cloud).not.toBeNull();
    expect(JSON.parse(kv.getItem('hk.boot')!)).toMatchObject({ stage: 'started' });
    expect(r.stages[2]).toBe('gl');
    trail.done();
    expect(new BootTrail(kv, 'b1', 'build', () => 0).last).toBeNull();
  });

  it('a boot that throws: the error waits on the device, and the trail names the step it died in', async () => {
    const kv = trailStore();
    const trail = new BootTrail(kv, 'b1', 'build', () => 0);
    const r = rig({ host: 'ios' });
    r.platform.createApp = () => Promise.reject(new Error('no WebGL'));
    await expect(r.go((s, info) => trail.step(s, info))).rejects.toThrow('no WebGL');
    expect(new AnomalyStash(r.storage).take()).toEqual([expect.objectContaining({ kind: 'error', place: 'boot', msg: expect.stringContaining('no WebGL') })]);
    expect(new BootTrail(kv, 'b2', 'build', () => 0).last).toMatchObject({ kind: 'boot_fail', stage: 'app' });
  });
});
