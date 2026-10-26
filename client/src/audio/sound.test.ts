import { describe, expect, it } from 'vitest';
import type { MusicDeck } from './music';
import { Sound, type SoundHost } from './Sound';

// Sound making way for the player's own music (docs/audio.md): the game's music fades out and
// stops, the effects play under it, and the settings volumes are left as they were.

/** A gain's AudioParam that keeps where its last ramp is headed. */
function param(value: number) {
  const p = {
    value,
    target: value,
    cancelScheduledValues() {},
    setValueAtTime(v: number) { p.value = v; },
    linearRampToValueAtTime(v: number) { p.target = v; },
  };
  return p;
}

function fakeContext() {
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 8,
    destination: {},
    createGain: () => ({ gain: param(1), connect() {} }),
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
  };
  return ctx;
}

class FakeDeck implements MusicDeck {
  level = 0;
  playing: string | null = null;
  play(path: string) { this.playing = path; }
  setLevel(level: number) { this.level = level; }
  stop() { this.playing = null; }
  position() { return this.playing ? 0 : null; }
  setPaused() {}
}

function setup() {
  let gesture = () => {};
  let other: (playing: boolean) => void = () => {};
  const ctx = fakeContext();
  const decks: [FakeDeck, FakeDeck] = [new FakeDeck(), new FakeDeck()];
  const host: SoundHost = {
    audio: {
      context: () => ctx as unknown as AudioContext,
      onGesture: (cb) => void (gesture = cb),
      onFocus() {},
      onHostMute() {},
      onOtherAudio: (cb) => void (other = cb),
      musicDecks: () => decks,
    },
    loadPack: () => Promise.resolve(),
    readText: () => Promise.resolve(JSON.stringify({ music: { lobby: { path: 'audio/music/lobby.mp3', length: 64 } } })),
    readBinary: () => Promise.reject(new Error('none')),
  };
  const sound = new Sound(host, 5, 5);
  return { sound, decks, start: () => gesture(), other: (on: boolean) => other(on) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Sound and the player\'s own music', () => {
  it('fades its music out and back, plays the effects under the other music, and keeps the settings', async () => {
    const { sound, decks, start, other } = setup();
    start();
    await settle();
    const master = (sound as unknown as { master: { gain: ReturnType<typeof param> } }).master.gain;
    const full = master.value;
    sound.flush('lobby', 0);
    sound.flush('lobby', 5000);
    expect(decks[0].level).toBeCloseTo(0.45, 5);
    other(true);
    expect(master.target).toBeCloseTo(full * 0.6, 5);
    sound.flush('lobby', 0);
    sound.flush('lobby', 5000);
    expect([decks[0].level, decks[0].playing]).toEqual([0, null]);
    expect([sound.level, sound.musicLevel]).toEqual([5, 5]);
    other(false);
    expect(master.target).toBeCloseTo(full, 5);
    sound.flush('lobby', 0);
    sound.flush('lobby', 5000);
    expect(decks[0].playing).toBe('audio/music/lobby.mp3');
    expect(decks[0].level).toBeCloseTo(0.45, 5);
  });

  it('is told before there is a context, and opens the effects at the lowered level once there is', async () => {
    const { sound, start, other } = setup();
    other(true);
    start();
    await settle();
    const master = (sound as unknown as { master: { gain: ReturnType<typeof param> } }).master.gain;
    expect(master.value).toBeCloseTo(0.8 * 0.6, 5);
  });
});
