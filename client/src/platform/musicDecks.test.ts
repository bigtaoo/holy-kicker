import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayer, XFADE } from '../audio/music';
import { FakeInnerAudio } from '../testkit/fakeWxRuntime';
import { WebMusicDeck } from './web/webMusicDeck';
import { WeChatMusicDeck } from './wechat/weChatMusicDeck';

// The two hosts' music decks: a web Audio element through a gain node, and WeChat's
// InnerAudioContext; then the music player crossfading between two real decks.

/** An Audio element as the web deck drives it; `refuse` makes play() reject (autoplay rules). */
class FakeAudioEl {
  static made: FakeAudioEl[] = [];
  static refuse = false;
  loop = true;
  preload = '';
  paused = true;
  calls: string[] = [];
  private s = '';
  private t = 0;
  seekable = true;
  constructor() {
    FakeAudioEl.made.push(this);
  }
  get src() {
    return this.s;
  }
  set src(v: string) {
    this.s = `https://h.example/${v}`;
    this.calls.push(`src ${v}`);
  }
  get currentTime() {
    return this.t;
  }
  set currentTime(v: number) {
    if (!this.seekable) throw new Error('InvalidStateError');
    this.t = v;
  }
  play(): Promise<void> {
    this.calls.push('play');
    if (FakeAudioEl.refuse) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.calls.push('pause');
  }
  advance(s: number) {
    this.t += s;
  }
}

function fakeContext() {
  const gains: { gain: { value: number }; connected: unknown[] }[] = [];
  const sources: unknown[] = [];
  const destination = { kind: 'speakers' };
  const ctx = {
    destination,
    createGain() {
      const g = { gain: { value: 1 }, connected: [] as unknown[], connect(to: unknown) { g.connected.push(to); } };
      gains.push(g);
      return g;
    },
    createMediaElementSource(el: unknown) {
      sources.push(el);
      return { connect: (to: unknown) => void sources.push(to) };
    },
  };
  return { ctx: ctx as unknown as AudioContext, gains, sources, destination };
}

function webDeck() {
  FakeAudioEl.made = [];
  FakeAudioEl.refuse = false;
  vi.stubGlobal('Audio', FakeAudioEl);
  const c = fakeContext();
  const deck = new WebMusicDeck(c.ctx);
  return { deck, el: FakeAudioEl.made[0], ...c };
}

afterEach(() => vi.unstubAllGlobals());

describe('WebMusicDeck', () => {
  it('streams one element through its own silent gain node into the speakers', () => {
    const { el, gains, sources, destination } = webDeck();
    expect([el.loop, el.preload]).toEqual([false, 'auto']);
    expect(gains[0].gain.value).toBe(0);
    expect(sources).toEqual([el, gains[0]]);
    expect(gains[0].connected).toEqual([destination]);
  });

  it('plays a file, rewinds the same file rather than reload it, and reads its place', () => {
    const { deck, el, gains } = webDeck();
    expect(deck.position()).toBeNull();
    deck.play('audio/battle.mp3');
    el.advance(12);
    expect(deck.position()).toBe(12);
    deck.play('audio/battle.mp3');
    expect(el.calls).toEqual(['src audio/battle.mp3', 'play', 'play']);
    expect(deck.position()).toBe(0);
    deck.setLevel(0.7);
    expect(gains[0].gain.value).toBe(0.7);
  });

  it('pauses and resumes in place, stops and rewinds, and ignores both while stopped', () => {
    const { deck, el } = webDeck();
    deck.setPaused(true);
    deck.stop();
    expect(el.calls).toEqual([]);
    deck.play('audio/lobby.mp3');
    el.advance(5);
    deck.setPaused(true);
    expect([el.paused, deck.position()]).toEqual([true, 5]);
    deck.setPaused(false);
    expect(el.paused).toBe(false);
    deck.stop();
    expect([el.paused, el.currentTime, deck.position()]).toEqual([true, 0, null]);
  });

  it('counts a play the browser refused as not playing, and survives an element not seekable yet', async () => {
    const { deck, el } = webDeck();
    FakeAudioEl.refuse = true;
    deck.play('audio/lobby.mp3');
    await Promise.resolve();
    await Promise.resolve();
    expect(deck.position()).toBeNull();
    FakeAudioEl.refuse = false;
    el.seekable = false;
    expect(() => deck.play('audio/lobby.mp3')).not.toThrow();
    FakeAudioEl.refuse = true;
    deck.setPaused(true);
    expect(() => deck.setPaused(false)).not.toThrow();
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
