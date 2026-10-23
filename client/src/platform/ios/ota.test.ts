import { describe, expect, it, vi } from 'vitest';
import releaseWorkflow from '../../../../.github/workflows/ios-app.yml?raw';
import otaWorkflow from '../../../../.github/workflows/ota-ios.yml?raw';
import wrangler from '../../../../wrangler/ota.jsonc?raw';
import wranglerCorgi from '../../../../wrangler/ota-corgi.jsonc?raw';
import APPS from './apps.json';
import capConfig from '../../../capacitor.config.ts?raw';
import podfile from '../../../ios/App/Podfile?raw';
import privacy from '../../../ios/App/App/PrivacyInfo.xcprivacy?raw';
import bridgeSwift from '../../../ios/App/App/HKBridgeViewController.swift?raw';
import { applyDownloaded, findOta, installOta, isNewer, MANIFEST_URL, pickDownloaded, readyOta, REVOKE_KEY, wantsDownload, type Bundle, type Updater } from './ota';

const manifest = { version: '1.0.18.2', url: 'https://hk-ota.gamestao.com/1.0.18.2.zip', checksum: 'ab12', minNativeVersion: '1.0' };

function fakeUpdater(bundles: Bundle[] = [], native = '1.0', fails = false): Updater & { calls: string[] } {
  const calls: string[] = [];
  let progress: (e: { percent: number }) => void = () => {};
  return {
    calls,
    addListener: async (_event, cb) => {
      progress = cb;
      return { remove: async () => { calls.push('unlisten'); } };
    },
    notifyAppReady: async () => { calls.push('ready'); },
    current: async () => ({ native }),
    list: async () => ({ bundles }),
    download: async (o) => {
      calls.push(`download ${o.version} ${o.checksum}`);
      progress({ percent: 50 });
      if (fails) throw new Error('checksum');
      return { id: 'x', version: o.version, status: 'pending' };
    },
    set: async (o) => { calls.push(`set ${o.id}`); },
    reset: async () => { calls.push('reset'); },
  };
}

function kv(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('version order', () => {
  it('compares dotted numbers, not strings', () => {
    expect(isNewer('1.0.18.10', '1.0.18.9')).toBe(true);
    expect(isNewer('1.0.19', '1.0.18.7')).toBe(true);
    expect(isNewer('1.0.18.1', '1.0.18')).toBe(true);
    expect(isNewer('1.0.18', '1.0.18')).toBe(false);
    expect(isNewer('1.0.18', '1.0.18.1')).toBe(false);
  });
});

describe('wantsDownload', () => {
  it('takes a newer bundle this shell can run', () => {
    expect(wantsDownload(manifest, '1.0.18.1', '1.0', 4, [])).toBe(true);
  });

  it('refuses what is not newer, needs a newer shell, has no checksum or is on the device', () => {
    expect(wantsDownload(manifest, '1.0.18.2', '1.0', 4, [])).toBe(false);
    expect(wantsDownload(manifest, '1.0.19', '1.0', 4, [])).toBe(false);
    expect(wantsDownload({ ...manifest, minNativeVersion: '1.1' }, '1.0.18', '1.0', 4, [])).toBe(false);
    expect(wantsDownload({ ...manifest, checksum: '' }, '1.0.18', '1.0', 4, [])).toBe(false);
    expect(wantsDownload({ version: '9' }, '1.0.18', '1.0', 4, [])).toBe(false);
    expect(wantsDownload(null, '1.0.18', '1.0', 4, [])).toBe(false);
    expect(wantsDownload(manifest, '1.0.18', '1.0', 4, [{ id: 'a', version: '1.0.18.2', status: 'error' }])).toBe(false);
  });

  it('refuses a bundle that needs a newer bridge, one taken back, and anything while stopped', () => {
    expect(wantsDownload({ ...manifest, minBridge: 4 }, '1.0.18', '1.0', 4, [])).toBe(true);
    expect(wantsDownload({ ...manifest, minBridge: 5 }, '1.0.18', '1.0', 4, [])).toBe(false);
    expect(wantsDownload({ ...manifest, revoke: ['1.0.18.2'] }, '1.0.18', '1.0', 4, [])).toBe(false);
    expect(wantsDownload({ ...manifest, stop: true }, '1.0.18', '1.0', 4, [])).toBe(false);
  });

  it('keeps a stop manifest out of reach of the bundles that predate `stop`', () => {
    // what the workflow writes for a stop, read the way those bundles read it
    const stopped: Record<string, unknown> = { version: '1.0.18.2', stop: true, revoke: [], minNativeVersion: '999' };
    const old = (m: Record<string, unknown>) =>
      typeof m.url === 'string' && typeof m.checksum === 'string' && !isNewer(String(m.minNativeVersion), '1.0');
    expect(old(stopped)).toBe(false);
    expect(otaWorkflow).toContain('{version: $v, stop: true, revoke: $revoke, minNativeVersion: "999"}');
  });
});

describe('pickDownloaded', () => {
  it('picks the newest usable bundle above the running one', () => {
    const have: Bundle[] = [
      { id: 'a', version: '1.0.18.1', status: 'success' },
      { id: 'b', version: '1.0.18.3', status: 'error' },
      { id: 'c', version: '1.0.18.2', status: 'pending' },
      { id: 'd', version: '1.0.17.9', status: 'pending' },
    ];
    expect(pickDownloaded(have, '1.0.18')?.id).toBe('c');
    expect(pickDownloaded(have, '1.0.18.2')).toBeNull();
    expect(pickDownloaded(have, '1.0.18', ['1.0.18.2'])?.id).toBe('a');
  });
});

describe('the updater calls', () => {
  it('confirm the bundle at launch', async () => {
    const u = fakeUpdater();
    await readyOta('1.0.18', true, u);
    expect(u.calls).toEqual(['ready']);
  });

  it('offer a newer bundle without downloading it', async () => {
    const u = fakeUpdater();
    expect(await findOta('1.0.18', true, u, async () => manifest, kv(), 4)).toEqual(manifest);
    expect(u.calls).toEqual([]);
  });

  it('download with progress on a yes, then switch to it', async () => {
    const u = fakeUpdater();
    const seen: number[] = [];
    await installOta(manifest, (f) => seen.push(f), u);
    expect(seen).toEqual([0.5, 1]);
    expect(u.calls).toEqual(['download 1.0.18.2 ab12', 'set x', 'unlisten']);
    const failing = fakeUpdater([], '1.0', true);
    await expect(installOta(manifest, () => {}, failing)).rejects.toThrow('checksum');
    expect(failing.calls).toEqual(['download 1.0.18.2 ab12', 'unlisten']);
  });

  it('do nothing in development, in a browser, or when the manifest fails', async () => {
    const u = fakeUpdater();
    await readyOta('0.0.0', true, u);
    expect(await findOta('0.0.0', true, u, async () => manifest, kv())).toBe(null);
    expect(await findOta('1.0.18', false, u, async () => manifest, kv())).toBe(null);
    expect(u.calls).toEqual([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await findOta('1.0.18', true, u, async () => { throw new Error('offline'); }, kv())).toBe(null);
    expect(await findOta('1.0.18', true, u, async () => null, kv())).toBe(null);
    warn.mockRestore();
  });

  it('switch to a downloaded bundle at launch', async () => {
    const u = fakeUpdater([{ id: 'c', version: '1.0.18.2', status: 'pending' }]);
    expect(await applyDownloaded('1.0.18', true, u, kv())).toBe(true);
    expect(u.calls).toEqual(['set c']);
    expect(await applyDownloaded('1.0.18.2', true, fakeUpdater(), kv())).toBe(false);
    expect(await applyDownloaded('0.0.0', true, u, kv())).toBe(false);
  });

  it("keep the manifest's revoke list, and at the next launch leave a bundle taken back", async () => {
    const store = kv();
    const u = fakeUpdater([{ id: 'c', version: '1.0.18.2', status: 'success' }]);
    const stopped = { version: '1.0.18.2', stop: true, revoke: ['1.0.18.2'], minNativeVersion: '999' };
    expect(await findOta('1.0.18.2', true, u, async () => stopped, store, 4)).toBe(null);
    expect(store.m.get(REVOKE_KEY)).toBe('["1.0.18.2"]');
    expect(await applyDownloaded('1.0.18.2', true, u, store)).toBe(true);
    expect(u.calls).toEqual(['reset']);
    // a downloaded bundle taken back is never switched to, and a shell's own is never left
    const shell = fakeUpdater([{ id: 'c', version: '1.0.18.2', status: 'pending' }]);
    expect(await applyDownloaded('1.0.18', true, shell, store)).toBe(false);
    expect(await applyDownloaded('1.0.18', true, shell, kv({ [REVOKE_KEY]: '["1.0.18"]' }))).toBe(true);
    expect(shell.calls).toEqual(['set c']);
  });

  it("pass the shell's bridge contract to the gate", async () => {
    const u = fakeUpdater();
    expect(await findOta('1.0.18', true, u, async () => ({ ...manifest, minBridge: 5 }), kv(), 4)).toBe(null);
    expect(await findOta('1.0.18', true, u, async () => ({ ...manifest, minBridge: 5 }), kv(), 5)).not.toBe(null);
  });

  it('read the bridge gate from the shell this commit builds', () => {
    expect(otaWorkflow).toContain("sed -nE 's/.*static let bridgeVersion = ([0-9]+).*/\\1/p' client/ios/App/App/HKBridgeViewController.swift");
    expect(bridgeSwift).toMatch(/static let bridgeVersion = \d+/);
  });
});

describe('the shell and the pipeline agree', () => {
  it('keeps the plugin out of Capgo\'s cloud and in manual mode', () => {
    expect(capConfig).toContain('autoUpdate: false');
    expect(capConfig).toContain("statsUrl: ''");
    expect(podfile).toContain("pod 'CapgoCapacitorUpdater'");
    for (const reason of ['CA92.1', 'C617.1', 'E174.1']) expect(privacy).toContain(`<string>${reason}</string>`);
  });

  it('stamps the bundle version in both workflows and hosts the manifest where the app reads it', () => {
    expect(releaseWorkflow).toContain('HK_BUNDLE_VERSION: ${{ steps.ver.outputs.version }}');
    expect(otaWorkflow).toContain('HK_BUNDLE_VERSION: ${{ steps.ver.outputs.version }}');
    expect(MANIFEST_URL).toBe(`${APPS.monk.ota}/manifest.json`);
    // each app on its own host, deployed with its own config
    const configs = { monk: ['wrangler/ota.jsonc', wrangler], corgi: ['wrangler/ota-corgi.jsonc', wranglerCorgi] } as const;
    for (const theme of ['monk', 'corgi'] as const) {
      const [path, config] = configs[theme];
      expect(otaWorkflow).toContain(`'${APPS[theme].ota}'`);
      expect(otaWorkflow).toContain(`'${path}'`);
      expect(config).toContain(`"pattern": "${new URL(APPS[theme].ota).host}"`);
    }
    expect(otaWorkflow).toContain('npx -y wrangler@4.118.0 deploy -c "$WRANGLER_CONFIG"');
  });
});
