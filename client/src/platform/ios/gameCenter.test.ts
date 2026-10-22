import { describe, expect, it } from 'vitest';
import type { GameCenterState, HKNative } from './bridge';
import { GameCenterAccount } from './gameCenter';

// Game Center's nickname and sign-in offer as the page reads them from the shell's bridge.

function shell(initial: GameCenterState | null) {
  let listener: ((s: GameCenterState) => void) | null = null;
  const signIns: number[] = [];
  const native: Partial<HKNative> = {
    gameCenter: () => initial,
    onGameCenter: (cb) => (listener = cb),
    gameCenterSignIn: () => signIns.push(1),
  };
  return { native, signIns, push: (s: unknown) => listener?.(s as GameCenterState) };
}

describe('Game Center account', () => {
  it('has no name and no offer without the bridge or before GameKit answers', () => {
    for (const native of [null, {}, shell(null).native]) {
      const gc = new GameCenterAccount(native);
      expect(gc.alias()).toBeNull();
      expect(gc.canSignIn()).toBe(false);
    }
  });

  it('reads the state the shell already has at boot', () => {
    expect(new GameCenterAccount(shell({ alias: 'Kicker', canSignIn: false }).native).alias()).toBe('Kicker');
  });

  it('takes later states and reports only real changes', () => {
    const s = shell(null);
    const gc = new GameCenterAccount(s.native);
    let changes = 0;
    gc.onChange = () => changes++;
    s.push({ alias: null, canSignIn: true });
    expect(gc.canSignIn()).toBe(true);
    s.push({ alias: null, canSignIn: true });
    expect(changes).toBe(1);
    s.push({ alias: 'Kicker', canSignIn: false });
    expect([gc.alias(), gc.canSignIn(), changes]).toEqual(['Kicker', false, 2]);
  });

  it('reads a malformed state as signed out', () => {
    const s = shell(null);
    const gc = new GameCenterAccount(s.native);
    s.push({ alias: 7, canSignIn: 'yes' });
    expect([gc.alias(), gc.canSignIn()]).toEqual([null, false]);
    s.push({ alias: '', canSignIn: true });
    expect(gc.alias()).toBeNull();
  });

  it('asks for the sheet only while it is offered', () => {
    const s = shell({ alias: null, canSignIn: false });
    const gc = new GameCenterAccount(s.native);
    gc.signIn();
    expect(s.signIns).toHaveLength(0);
    s.push({ alias: null, canSignIn: true });
    gc.signIn();
    expect(s.signIns).toHaveLength(1);
  });
});

describe('Game Center identity', () => {
  const signed = { ok: true, player: 'T:1', alt: 'G:1', bundle: 'com.gamestao.holykicker', key: 'https://static.gc.apple.com/k.cer', sig: 'c2ln', salt: 'c2FsdA==', ts: 5 };

  function signer(v: number, answer: unknown) {
    let cb: ((a: unknown) => void) | null = null;
    const native = {
      v, gameCenter: () => ({ alias: 'Kicker', canSignIn: false }), onGameCenter: () => {},
      onGameCenterIdentity: (f: (a: unknown) => void) => (cb = f),
      gameCenterIdentity: () => queueMicrotask(() => cb?.(answer)),
    } as unknown as Partial<HKNative>;
    return new GameCenterAccount(native);
  }

  it('passes on what GameKit signed', async () => {
    expect(await signer(5, signed).identity()).toEqual({ player: 'T:1', alt: 'G:1', bundle: signed.bundle, key: signed.key, sig: 'c2ln', salt: 'c2FsdA==', ts: 5 });
  });

  it('has none on an older shell, signed out or on a broken answer', async () => {
    expect(await signer(4, signed).identity()).toBeNull();
    expect(await signer(5, { ok: false }).identity()).toBeNull();
    expect(await signer(5, { ...signed, sig: 7 }).identity()).toBeNull();
    expect(await new GameCenterAccount(shell(null).native).identity()).toBeNull();
  });
});
