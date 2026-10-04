import { describe, expect, it } from 'vitest';
import { MusicPlayer, XFADE, type MusicDeck } from './music';
import { parseManifest, SampleBank } from './samples';

class FakeDeck implements MusicDeck {
  path: string | null = null;
  level = 0;
  pos: number | null = null;
  paused = false;
  plays = 0;
  play(path: string) {
    this.path = path;
    this.pos = 0;
    this.plays++;
  }
  setLevel(level: number) {
    this.level = level;
  }
  stop() {
    this.pos = null;
  }
  position() {
    return this.pos;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
  }
}

const TRACKS = { lobby: { path: 'lobby.mp3', length: 60 }, battle: { path: 'battle.mp3', length: 70 } };

function setup() {
  const a = new FakeDeck();
  const b = new FakeDeck();
  return { a, b, player: new MusicPlayer([a, b], TRACKS) };
}

const fadeMs = XFADE * 1000;

describe('MusicPlayer', () => {
  it('fades a track in from silence', () => {
    const { a, b, player } = setup();
    player.update('lobby', 0);
    expect(a.path).toBe('lobby.mp3');
    expect(a.level).toBe(0);
    player.update('lobby', fadeMs / 2);
    expect(a.level).toBeCloseTo(Math.SQRT1_2);
    player.update('lobby', fadeMs);
    expect(a.level).toBe(1);
    expect(b.path).toBeNull();
  });

  it('crossfades to another track on the other deck, then stops the old one', () => {
    const { a, b, player } = setup();
    player.update('lobby', 0);
    player.update('lobby', fadeMs);
    player.update('battle', 0);
    expect(b.path).toBe('battle.mp3');
    player.update('battle', fadeMs / 2);
    // equal power: the two levels sum to one in power
    expect(a.level ** 2 + b.level ** 2).toBeCloseTo(1);
    player.update('battle', fadeMs);
    expect(b.level).toBe(1);
    expect(a.level).toBe(0);
    expect(a.pos).toBeNull();
  });

  it('loops by crossfading into the same file XFADE seconds before the end', () => {
    const { a, b, player } = setup();
    player.update('lobby', 0);
    player.update('lobby', fadeMs);
    a.pos = 60 - XFADE - 0.1;
    player.update('lobby', 16);
    expect(b.path).toBeNull();
    a.pos = 60 - XFADE + 0.01;
    player.update('lobby', 16);
    expect(b.path).toBe('lobby.mp3');
    player.update('lobby', fadeMs);
    expect(b.level).toBe(1);
    expect(a.pos).toBeNull();
  });

  it('scales every deck by the bus volume and fades out to silence', () => {
    const { a, player } = setup();
    player.update('lobby', 0);
    player.update('lobby', fadeMs);
    player.setVolume(0.5);
    expect(a.level).toBe(0.5);
    player.update(null, 0);
    player.update(null, fadeMs);
    expect(a.level).toBe(0);
    expect(player.current).toBeNull();
  });

  it('holds everything while paused and ignores tracks it does not have', () => {
    const { a, b, player } = setup();
    player.setPaused(true);
    player.update('lobby', 0);
    expect(a.path).toBeNull();
    expect(a.paused && b.paused).toBe(true);
    player.setPaused(false);
    const bare = new MusicPlayer([a, b], {});
    bare.update('battle', 0);
    expect(bare.current).toBeNull();
  });
});

describe('sound manifest', () => {
  it('reads a manifest and tolerates missing sections', () => {
    expect(parseManifest('{"sfx":{"kick":["a.mp3"]}}')).toEqual({ sfx: { kick: ['a.mp3'] }, music: {} });
    expect(parseManifest('null')).toEqual({ sfx: {}, music: {} });
  });

  it('keeps a cue synth when its file fails, and picks among variants', async () => {
    const bank = new SampleBank();
    const buf = (n: number) => ({ duration: n }) as AudioBuffer;
    const ctx = { decodeAudioData: (d: ArrayBuffer) => Promise.resolve(buf(d.byteLength)) };
    const read = async (path: string) => {
      if (path === 'bad.mp3') throw new Error('404');
      return new ArrayBuffer(path.length);
    };
    const warn = console.warn;
    console.warn = () => {};
    await bank.load({ sfx: { kick: ['k1.mp3', 'k22.mp3'], hit: ['bad.mp3'] }, music: {} }, ctx, read);
    console.warn = warn;
    expect(bank.size).toBe(1);
    expect(bank.pick('hit', 0)).toBeNull();
    expect(bank.pick('kick', 0)?.duration).toBe(6);
    expect(bank.pick('kick', 0.99)?.duration).toBe(7);
  });
});
