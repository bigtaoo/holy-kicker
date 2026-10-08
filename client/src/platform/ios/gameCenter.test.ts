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
