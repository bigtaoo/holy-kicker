import type { GameCenterState, HKNative } from './bridge';

// Game Center through the shell's bridge (docs/ios.md "Game Center"): the nickname the boards
// show and Apple's sign-in sheet, offered from a tap. GameKit answers some time after launch, so
// the name can arrive with the lobby already up; `onChange` redraws it then.

export class GameCenterAccount {
  /** Called whenever the nickname or the sign-in offer changes. */
  onChange: () => void = () => {};
  private state: GameCenterState | null;

  constructor(private readonly native: Partial<HKNative> | null) {
    this.state = typeof native?.gameCenter === 'function' ? clean(native.gameCenter.call(native)) : null;
    native?.onGameCenter?.call(native, (s) => {
      const next = clean(s);
      if (next?.alias === this.state?.alias && next?.canSignIn === this.state?.canSignIn) return;
      this.state = next;
      this.onChange();
    });
  }

  /** The signed-in player's nickname, null when not signed in (or not on the app). */
  alias(): string | null {
    return this.state?.alias ?? null;
  }

  /** Whether a tap can bring up Apple's sign-in sheet now. */
  canSignIn(): boolean {
    return !!this.state?.canSignIn && typeof this.native?.gameCenterSignIn === 'function';
  }

  signIn(): void {
    if (this.canSignIn()) this.native?.gameCenterSignIn?.call(this.native);
  }
}

/** The shell's state as the page trusts it: anything malformed reads as unknown. */
function clean(s: unknown): GameCenterState | null {
  if (!s || typeof s !== 'object') return null;
  const { alias, canSignIn } = s as Record<string, unknown>;
  return { alias: typeof alias === 'string' && alias ? alias : null, canSignIn: canSignIn === true };
}
