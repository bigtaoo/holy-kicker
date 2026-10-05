import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANNER_H, BANNER_ID, BANNER_REFRESH_MS, BANNER_W, BannerHost, type BannerFill } from './banner';

function setup(available = true) {
  let t = 0;
  const calls: string[] = [];
  const shown: boolean[] = [];
  const fill: BannerFill = {
    available: async () => available,
    request: async (id, w, h) => void calls.push(`request ${id} ${w}x${h}`),
    clear: (id) => void calls.push(`clear ${id}`),
  };
  const host = new BannerHost(fill, () => ({ setVisible: (v) => void shown.push(v) }), () => t);
  return { host, calls, shown, advance: (ms: number) => { t += ms; vi.advanceTimersByTime(ms); } };
}

afterEach(() => vi.useRealTimers());

describe('BannerHost', () => {
  it('shows and requests a sized banner, then hides and clears it', async () => {
    const { host, calls, shown } = setup();
    expect(await host.show()).toBe(true);
    host.hide();
    expect(shown).toEqual([true, false]);
    expect(calls).toEqual([`request ${BANNER_ID} ${BANNER_W}x${BANNER_H}`, `clear ${BANNER_ID}`]);
  });

  it('stays down without an ad host, and reserves no band then', async () => {
    const { host, calls, shown } = setup(false);
    expect(await host.show()).toBe(false);
    host.hide();
    expect(shown).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('asks again only once the refresh floor has passed', async () => {
    vi.useFakeTimers();
    const { host, calls, advance } = setup();
    await host.show();
    host.hide();
    advance(10_000);
    await host.show();
    expect(calls.filter((c) => c.startsWith('request'))).toHaveLength(1);
    advance(BANNER_REFRESH_MS - 10_000);
    expect(calls.filter((c) => c.startsWith('request'))).toHaveLength(2);
  });

  it('drops a waiting request when the lobby is left first', async () => {
    vi.useFakeTimers();
    const { host, calls, advance } = setup();
    await host.show();
    host.hide();
    await host.show();
    host.hide();
    advance(BANNER_REFRESH_MS);
    expect(calls.filter((c) => c.startsWith('request'))).toHaveLength(1);
  });

  it('does not come up when hidden while still checking for an ad host', async () => {
    const { host, shown } = setup();
    const up = host.show();
    host.hide();
    expect(await up).toBe(false);
    expect(shown).toEqual([]);
  });

  it('a second show while up does not request again', async () => {
    const { host, calls } = setup();
    await host.show();
    await host.show();
    expect(calls).toHaveLength(1);
  });
});
