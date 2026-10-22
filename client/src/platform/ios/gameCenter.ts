import type { GcIdentity } from '@hk/protocol';
import type { GameCenterIdentity, GameCenterState, HKNative } from './bridge';

// Game Center through the shell's bridge (docs/ios.md "Game Center"): the nickname the boards
// show and Apple's sign-in sheet, offered from a tap. GameKit answers some time after launch, so
// the name can arrive with the lobby already up; `onChange` redraws it then. The cloud save asks
// it for the player's signed identity (bridge v5, docs/cloud-save.md "iOS: Game Center").

/** How long GameKit gets to sign the player (ms). */
const IDENTITY_WAIT_MS = 10_000;

export class GameCenterAccount {
  /** Called whenever the nickname or the sign-in offer changes. */
  onChange: () => void = () => {};
  private state: GameCenterState | null;
  private waiting: ((id: GcIdentity | null) => void)[] = [];

  constructor(private readonly native: Partial<HKNative> | null) {
    this.state = typeof native?.gameCenter === 'function' ? clean(native.gameCenter.call(native)) : null;
    native?.onGameCenter?.call(native, (s) => {
      const next = clean(s);
      if (next?.alias === this.state?.alias && next?.canSignIn === this.state?.canSignIn) return;
      this.state = next;
      this.onChange();
    });
    native?.onGameCenterIdentity?.call(native, (answer) => {
      const id = identityOf(answer);
      for (const done of this.waiting.splice(0)) done(id);
    });
  }

  /** The signed-in player's identity, signed by GameKit; null when not signed in or on an older shell. */
  identity(): Promise<GcIdentity | null> {
    const n = this.native;
    if (!this.alias() || !n || (n.v ?? 0) < 5 || typeof n.gameCenterIdentity !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (id: GcIdentity | null) => {
        clearTimeout(timer);
        this.waiting = this.waiting.filter((w) => w !== done);
        resolve(id);
      };
      const timer = setTimeout(() => done(null), IDENTITY_WAIT_MS);
      this.waiting.push(done);
      n.gameCenterIdentity?.call(n);
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

/** The shell's answer as the server reads it, or null when it is not a whole one. */
function identityOf(a: GameCenterIdentity | null | undefined): GcIdentity | null {
  if (!a || a.ok !== true) return null;
  const { player, alt, bundle, key, sig, salt, ts } = a;
  const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  if (!text(player) || !text(bundle) || !text(key) || !text(sig) || !text(salt) || typeof ts !== 'number') return null;
  return { player, ...(text(alt) && { alt }), bundle, key, sig, salt, ts };
}
