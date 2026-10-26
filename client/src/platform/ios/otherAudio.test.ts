import { describe, expect, it, vi } from 'vitest';
import type { AudioHost } from '../types';
import { shareSpeaker } from '../web/webAudio';
import type { HKNative, OtherAudio } from './bridge';
import { otherAudioFrom } from './otherAudio';

// iOS: the shell's word on the player's own music reaches the game's audio host, and the page
// asks WebKit for the mixing audio session; an older shell or a plain browser says nothing.

const web: AudioHost = {
  context: () => null,
  onGesture() {},
  onFocus() {},
  onHostMute() {},
  musicDecks: () => null,
};

function shell(last: OtherAudio | null) {
  const cbs: ((s: OtherAudio) => void)[] = [];
  const native: Partial<HKNative> = { otherAudio: () => last, onOtherAudio: (cb) => void cbs.push(cb) };
  // a shell may push anything; the host reads it defensively
  return { native, push: (s: unknown) => cbs.forEach((cb) => cb(s as OtherAudio)) };
}

describe('otherAudioFrom', () => {
  it('passes on what the shell said before and every change after', () => {
    const s = shell({ playing: true });
    const host = otherAudioFrom(web, s.native)!;
    const cb = vi.fn();
    host.onOtherAudio!(cb);
    s.push({ playing: false });
    s.push(null);
    s.push({ playing: true });
    expect(cb.mock.calls).toEqual([[true], [false], [false], [true]]);
    expect(host.musicDecks).toBe(web.musicDecks);
  });

  it('says nothing until the shell has answered', () => {
    const s = shell(null);
    const cb = vi.fn();
    otherAudioFrom(web, s.native)!.onOtherAudio!(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('leaves the browser host as it is on an older shell, in Safari, and without sound', () => {
    expect(otherAudioFrom(web, { v: 6 })).toBe(web);
    expect(otherAudioFrom(web, null)).toBe(web);
    expect(otherAudioFrom(null, shell(null).native)).toBeNull();
  });
});

describe('shareSpeaker', () => {
  it('asks for the ambient session where WebKit has one, and lets a refusal or its absence pass', () => {
    const nav = { audioSession: { type: 'auto' } };
    shareSpeaker(nav);
    expect(nav.audioSession.type).toBe('ambient');
    const refusing = { audioSession: Object.defineProperty({}, 'type', { set() { throw new Error('NotSupportedError'); } }) };
    expect(() => shareSpeaker(refusing)).not.toThrow();
    expect(() => shareSpeaker({})).not.toThrow();
    expect(() => shareSpeaker(undefined)).not.toThrow();
  });
});
