import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayer, XFADE } from '../audio/music';
import { FakeInnerAudio } from '../testkit/fakeWxRuntime';
import { MusicBuffers } from './web/musicBuffers';
import { WebMusicDeck } from './web/webMusicDeck';
import { WeChatMusicDeck } from './wechat/weChatMusicDeck';

// The two hosts' music decks: a decoded file through a buffer source and a gain node on the
// web, and WeChat's InnerAudioContext; then the music player crossfading between two real decks.

/** An AudioContext as the web deck drives it: a clock the test moves, gains and buffer sources. */
function fakeContext() {
  const gains: { gain: { value: number }; connected: unknown[] }[] = [];
  const sources: { buffer: unknown; started: [number, number] | null; stopped: boolean; connected: unknown[] }[] = [];
  const destination = { kind: 'speakers' };
  const ctx = {
    destination,
    currentTime: 0,
    createGain() {
      const g = { gain: { value: 1 }, connected: [] as unknown[], connect(to: unknown) { g.connected.push(to); } };
      gains.push(g);
      return g;
    },
    createBufferSource() {
      const s = {
        buffer: null as unknown,
        started: null as [number, number] | null,
        stopped: false,
        connected: [] as unknown[],
        connect(to: unknown) { s.connected.push(to); },
        disconnect() {},
        start(when: number, offset: number) { s.started = [when, offset]; },
        stop() {
          if (s.stopped) throw new Error('InvalidStateError');
          s.stopped = true;
        },
      };
      sources.push(s);
      return s;
    },
  };
  return { ctx: ctx as unknown as AudioContext, clock: ctx, gains, sources, destination };
}

/** Decodes a file into a fake buffer named after it; `fail` makes a path fail. */
function fakeBuffers(fail = new Set<string>()) {
  const reads: string[] = [];
  const decoder = {
    decodeAudioData: (data: ArrayBuffer) => {
      const name = new TextDecoder().decode(data);
      return fail.has(name) ? Promise.reject(new Error('EncodingError')) : Promise.resolve({ name } as unknown as AudioBuffer);
    },
  };
  const buffers = new MusicBuffers([decoder], async (path) => {
    reads.push(path);
    return new TextEncoder().encode(path).buffer as ArrayBuffer;
  });
  return { buffers, reads };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

function webDeck(fail?: Set<string>) {
  const c = fakeContext();
  const b = fakeBuffers(fail);
  return { deck: new WebMusicDeck(c.ctx, b.buffers), ...b, ...c };
}

afterEach(() => vi.restoreAllMocks());

describe('WebMusicDeck', () => {
  it('plays through its own silent gain node into the speakers, with no media element', () => {
    const { gains, destination } = webDeck();
    expect(gains[0].gain.value).toBe(0);
    expect(gains[0].connected).toEqual([destination]);
  });

  it('starts the decoded file, reads its place off the clock, and restarts the same file without decoding again', async () => {
    const { deck, sources, clock, gains, reads } = webDeck();
    deck.play('audio/battle.mp3');
    expect(deck.position()).toBeNull();
    await settle();
    expect(sources[0].buffer).toEqual({ name: 'audio/battle.mp3' });
    expect(sources[0].started).toEqual([0, 0]);
    expect(sources[0].connected).toEqual([gains[0]]);
    clock.currentTime = 12;
    expect(deck.position()).toBe(12);
    deck.play('audio/battle.mp3');
    expect(sources[0].stopped).toBe(true);
    expect(sources[1].started).toEqual([0, 0]);
    expect(deck.position()).toBe(0);
    expect(reads).toEqual(['audio/battle.mp3']);
    deck.setLevel(0.7);
    expect(gains[0].gain.value).toBe(0.7);
  });

  it('pauses and resumes in place, stops, and ignores both while stopped', async () => {
    const { deck, sources, clock } = webDeck();
    deck.setPaused(true);
    deck.setPaused(false);
    deck.stop();
    expect(sources).toEqual([]);
    deck.play('audio/lobby.mp3');
    await settle();
    clock.currentTime = 5;
    deck.setPaused(true);
    expect([sources[0].stopped, deck.position()]).toEqual([true, 5]);
    clock.currentTime = 50;
    expect(deck.position()).toBe(5);
    deck.setPaused(false);
    expect(sources[1].started).toEqual([0, 5]);
    clock.currentTime = 51;
    expect(deck.position()).toBe(6);
    deck.stop();
    expect([sources[1].stopped, deck.position()]).toEqual([true, null]);
  });

  it('starts a file decoded while paused only once resumed, and drops a file changed mid-decode', async () => {
    const { deck, sources } = webDeck();
    deck.play('audio/lobby.mp3');
    deck.setPaused(true);
    await settle();
    expect(sources).toEqual([]);
    expect(deck.position()).toBeNull();
    deck.setPaused(false);
    expect(sources[0].buffer).toEqual({ name: 'audio/lobby.mp3' });
    deck.play('audio/boss.mp3');
    deck.play('audio/battle.mp3');
    await settle();
    expect(sources.map((s) => (s.buffer as { name: string }).name)).toEqual(['audio/lobby.mp3', 'audio/battle.mp3']);
  });

  it('counts a file that failed to decode as not playing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deck, sources } = webDeck(new Set(['audio/boss.mp3']));
    deck.play('audio/boss.mp3');
    await settle();
    expect([sources.length, deck.position()]).toEqual([0, null]);
    expect(warn).toHaveBeenCalledWith('music: audio/boss.mp3 failed', expect.any(Error));
  });
});

describe('MusicBuffers', () => {
  it('shares one decode between holders, lets it go after the last release, and keeps the download', async () => {
    const { buffers, reads } = fakeBuffers();
    const a = buffers.hold('audio/battle.mp3');
    const b = buffers.hold('audio/battle.mp3');
    expect(a).toBe(b);
    buffers.release('audio/battle.mp3');
    expect(buffers.decoded).toBe(1);
    buffers.release('audio/battle.mp3');
    buffers.release('audio/never.mp3');
    expect(buffers.decoded).toBe(0);
    expect(await buffers.hold('audio/battle.mp3')).toEqual({ name: 'audio/battle.mp3' });
    expect(reads).toEqual(['audio/battle.mp3']);
  });

  it('falls back to the next decoder, each given its own copy of the bytes', async () => {
    const given: ArrayBuffer[] = [];
    const resampler = {
      decodeAudioData: (data: ArrayBuffer) => {
        given.push(data);
        return Promise.reject(new Error('NotSupportedError'));
      },
    };
    const ctx = {
      decodeAudioData: (data: ArrayBuffer) => {
        given.push(data);
        return Promise.resolve({ ok: true } as unknown as AudioBuffer);
      },
    };
    const file = new Uint8Array(4).buffer;
    const buffers = new MusicBuffers([resampler, ctx], async () => file);
    expect(await buffers.hold('a.mp3')).toEqual({ ok: true });
    expect(given.map((g) => [g.byteLength, g === file])).toEqual([[4, false], [4, false]]);
    expect(given[0]).not.toBe(given[1]);
    const none = new MusicBuffers([resampler], async () => file);
    await expect(none.hold('a.mp3')).rejects.toThrow('NotSupportedError');
  });

  it('downloads a file again after a failed download', async () => {
    let n = 0;
    const decoder = { decodeAudioData: () => Promise.resolve({} as AudioBuffer) };
    const buffers = new MusicBuffers([decoder], async () => {
      if (n++ === 0) throw new Error('offline');
      return new ArrayBuffer(1);
    });
    await expect(buffers.hold('a.mp3')).rejects.toThrow('offline');
    buffers.release('a.mp3');
    await settle();
    await expect(buffers.hold('a.mp3')).resolves.toEqual({});
  });
});

describe('WeChatMusicDeck', () => {
  const make = () => {
    const inner = new FakeInnerAudio();
    return { inner, deck: new WeChatMusicDeck(() => inner) };
  };

  it('plays a file, restarts the same one with stop, and writes the level into the volume', () => {
    const { deck, inner } = make();
    deck.play('audio/battle.mp3');
    inner.currentTime = 30;
    expect(deck.position()).toBe(30);
    deck.play('audio/battle.mp3');
    expect(inner.calls).toEqual(['src audio/battle.mp3', 'play', 'stop', 'play']);
    deck.setLevel(0.4);
    expect(inner.volume).toBe(0.4);
  });

  it('pauses, resumes and stops only while playing, and stops counting after a failed file', () => {
    const { deck, inner } = make();
    deck.stop();
    deck.setPaused(true);
    expect(inner.calls).toEqual([]);
    deck.play('audio/lobby.mp3');
    deck.setPaused(true);
    deck.setPaused(false);
    deck.stop();
    expect(inner.calls).toEqual(['src audio/lobby.mp3', 'play', 'pause', 'play', 'stop']);
    expect(deck.position()).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deck.play('audio/boss.mp3');
    inner.fail();
    expect(deck.position()).toBeNull();
    expect(warn).toHaveBeenCalledWith('music: audio/boss.mp3 failed', 'decode failed');
    warn.mockRestore();
  });
});

describe('MusicPlayer over two WeChat decks', () => {
  it('crossfades from one track to the next with equal power, and loops before the end', () => {
    const inners = [new FakeInnerAudio(), new FakeInnerAudio()];
    let n = 0;
    const decks = [new WeChatMusicDeck(() => inners[n++]), new WeChatMusicDeck(() => inners[n++])] as const;
    const player = new MusicPlayer(decks, { lobby: { path: 'audio/lobby.mp3', length: 60 }, battle: { path: 'audio/battle.mp3', length: 90 } });
    player.update('lobby', 0);
    player.update('lobby', XFADE * 1000);
    expect([inners[0].volume, inners[1].volume]).toEqual([1, 0]);
    player.update('battle', 0);
    player.update('battle', (XFADE * 1000) / 2);
    // halfway: both at cos/sin of 45°, so the loudness stays even
    expect(inners[0].volume).toBeCloseTo(Math.SQRT1_2, 5);
    expect(inners[1].volume).toBeCloseTo(Math.SQRT1_2, 5);
    player.update('battle', (XFADE * 1000) / 2);
    expect([inners[0].volume, inners[1].volume]).toEqual([0, 1]);
    expect(inners[0].calls.at(-1)).toBe('stop');
    // the wrap: XFADE seconds before the end, the other deck starts the same file again
    inners[1].currentTime = 90 - XFADE;
    player.update('battle', 16);
    expect(inners[0].calls.slice(-2)).toEqual(['src audio/battle.mp3', 'play']);
    // backgrounded: both decks hold
    player.setPaused(true);
    expect([inners[0].calls.at(-1), inners[1].calls.at(-1)]).toEqual(['pause', 'pause']);
    player.setPaused(false);
    player.setVolume(0.5);
    player.update(null, 0);
    expect(inners[0].volume).toBe(0.5);
    player.update(null, XFADE * 1000);
    expect([inners[0].volume, inners[1].volume]).toEqual([0, 0]);
  });
});
