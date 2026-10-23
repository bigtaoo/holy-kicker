import { describe, expect, it, vi } from 'vitest';
import type { AppUpdates, UpdateOffer } from '../platform/types';
import { STALL_MS, UpdateFlow } from './updateFlow';

const settle = () => new Promise((r) => setTimeout(r, 0));

/** An update host whose checks answer `offer` (or throw) and whose installs the test drives. */
function host(offer: () => UpdateOffer | null) {
  let checks = 0;
  const updates: AppUpdates = {
    check: async () => {
      checks++;
      return offer();
    },
  };
  return { updates, checks: () => checks };
}

function driven() {
  let progress: (f: number) => void = () => {};
  let finish: (ok: boolean) => void = () => {};
  const offer: UpdateOffer = {
    version: '1.0.22.2',
    install: (p) => {
      progress = p;
      return new Promise((resolve, reject) => (finish = (ok) => (ok ? resolve() : reject(new Error('no')))));
    },
  };
  return { offer, progress: (f: number) => progress(f), finish: (ok: boolean) => finish(ok) };
}

async function offered(flow: UpdateFlow) {
  flow.poll(true);
  await settle();
  flow.poll(true);
}

describe('UpdateFlow', () => {
  it('asks once the lobby is free, with the version found', async () => {
    const h = host(() => driven().offer);
    const flow = new UpdateFlow(h.updates, () => {});
    flow.poll(false);
    expect(h.checks()).toBe(0);
    await offered(flow);
    expect(h.checks()).toBe(1);
    expect(flow.state).toEqual({ step: 'offer', version: '1.0.22.2' });
  });

  it('asks nothing when offline, when nothing is wanted, or while the lobby is busy', async () => {
    const offline = new UpdateFlow({ check: () => Promise.reject(new Error('offline')) }, () => {});
    await offered(offline);
    expect(offline.state.step).toBe('none');
    const none = new UpdateFlow(host(() => null).updates, () => {});
    await offered(none);
    expect(none.state.step).toBe('none');
    const busy = new UpdateFlow(host(() => driven().offer).updates, () => {});
    busy.poll(true);
    await settle();
    busy.poll(false);
    expect(busy.state.step).toBe('none');
    busy.poll(true);
    expect(busy.state.step).toBe('offer');
  });

  it('after Later, asks again only after the next return from the background', async () => {
    const h = host(() => driven().offer);
    const flow = new UpdateFlow(h.updates, () => {});
    await offered(flow);
    flow.later();
    await offered(flow);
    expect(flow.state.step).toBe('none');
    expect(h.checks()).toBe(1);
    flow.hidden();
    flow.hidden();
    await offered(flow);
    expect(h.checks()).toBe(2);
    expect(flow.state.step).toBe('offer');
  });

  it('checks again when the game was hidden before the answer came', async () => {
    const h = host(() => driven().offer);
    const flow = new UpdateFlow(h.updates, () => {});
    flow.poll(true);
    flow.hidden();
    await settle();
    flow.poll(true);
    await settle();
    flow.poll(true);
    expect(h.checks()).toBe(2);
    expect(flow.state.step).toBe('offer');
  });

  it('shows the download as it goes, and a failure that can be tried again', async () => {
    const d = driven();
    const flow = new UpdateFlow(host(() => d.offer).updates, () => {});
    await offered(flow);
    flow.update();
    expect(flow.state).toEqual({ step: 'downloading', f: 0 });
    d.progress(0.4);
    d.progress(0.3);
    expect(flow.state).toEqual({ step: 'downloading', f: 0.4 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    d.finish(false);
    await settle();
    warn.mockRestore();
    expect(flow.state.step).toBe('failed');
    flow.update();
    d.progress(1);
    expect(flow.state).toEqual({ step: 'downloading', f: 1 });
    flow.later();
    expect(flow.state.step).toBe('none');
  });

  it('gives up on a download that stalls, and ignores what it says afterwards', async () => {
    let now = 0;
    const d = driven();
    const flow = new UpdateFlow(host(() => d.offer).updates, () => {}, () => now);
    await offered(flow);
    flow.update();
    const stalled = d.progress;
    now = STALL_MS + 1;
    flow.poll(true);
    expect(flow.state.step).toBe('failed');
    stalled(0.9);
    expect(flow.state.step).toBe('failed');
  });
});
