import { describe, expect, it, vi } from 'vitest';
import releaseWorkflow from '../../../../.github/workflows/release-ios.yml?raw';
import otaWorkflow from '../../../../.github/workflows/ota-ios.yml?raw';
import wrangler from '../../../../wrangler/ota.jsonc?raw';
import capConfig from '../../../capacitor.config.ts?raw';
import podfile from '../../../ios/App/Podfile?raw';
import privacy from '../../../ios/App/App/PrivacyInfo.xcprivacy?raw';
import { applyDownloaded, checkOta, isNewer, MANIFEST_URL, pickDownloaded, wantsDownload, type Bundle, type Updater } from './ota';

const manifest = { version: '1.0.18.2', url: 'https://hk-ota.gamestao.com/1.0.18.2.zip', checksum: 'ab12', minNativeVersion: '1.0' };

function fakeUpdater(bundles: Bundle[] = [], native = '1.0'): Updater & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    notifyAppReady: async () => { calls.push('ready'); },
    current: async () => ({ native }),
    list: async () => ({ bundles }),
    download: async (o) => { calls.push(`download ${o.version} ${o.checksum}`); return { id: 'x', version: o.version, status: 'pending' }; },
    set: async (o) => { calls.push(`set ${o.id}`); },
  };
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
    expect(wantsDownload(manifest, '1.0.18.1', '1.0', [])).toBe(true);
  });

  it('refuses what is not newer, needs a newer shell, has no checksum or is on the device', () => {
    expect(wantsDownload(manifest, '1.0.18.2', '1.0', [])).toBe(false);
    expect(wantsDownload(manifest, '1.0.19', '1.0', [])).toBe(false);
    expect(wantsDownload({ ...manifest, minNativeVersion: '1.1' }, '1.0.18', '1.0', [])).toBe(false);
    expect(wantsDownload({ ...manifest, checksum: '' }, '1.0.18', '1.0', [])).toBe(false);
    expect(wantsDownload({ version: '9' }, '1.0.18', '1.0', [])).toBe(false);
    expect(wantsDownload(null, '1.0.18', '1.0', [])).toBe(false);
    expect(wantsDownload(manifest, '1.0.18', '1.0', [{ id: 'a', version: '1.0.18.2', status: 'error' }])).toBe(false);
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
  });
});

describe('the updater calls', () => {
  it('confirm the bundle, then download a newer one for the next launch', async () => {
    const u = fakeUpdater();
    expect(await checkOta('1.0.18', true, u, async () => manifest)).toBe('downloaded');
    expect(u.calls).toEqual(['ready', 'download 1.0.18.2 ab12']);
  });

  it('do nothing in development, in a browser, or when the manifest fails', async () => {
    const u = fakeUpdater();
    expect(await checkOta('0.0.0', true, u, async () => manifest)).toBe('none');
    expect(await checkOta('1.0.18', false, u, async () => manifest)).toBe('none');
    expect(u.calls).toEqual([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await checkOta('1.0.18', true, u, async () => { throw new Error('offline'); })).toBe('none');
    warn.mockRestore();
  });

  it('switch to a downloaded bundle at launch', async () => {
    const u = fakeUpdater([{ id: 'c', version: '1.0.18.2', status: 'pending' }]);
    expect(await applyDownloaded('1.0.18', true, u)).toBe(true);
    expect(u.calls).toEqual(['set c']);
    expect(await applyDownloaded('1.0.18.2', true, fakeUpdater())).toBe(false);
    expect(await applyDownloaded('0.0.0', true, u)).toBe(false);
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
    expect(otaWorkflow).toContain(`MANIFEST_URL: ${MANIFEST_URL}`);
    expect(wrangler).toContain(`"pattern": "${new URL(MANIFEST_URL).host}"`);
    expect(otaWorkflow).toContain('wrangler deploy -c wrangler/ota.jsonc'.replace('wrangler deploy', 'wrangler@4.118.0 deploy'));
  });
});
