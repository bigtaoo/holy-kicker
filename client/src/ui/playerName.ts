import { checkName, rollDice, type BoardName } from '@hk/protocol';
import { t } from '../i18n';
import type { SaveData } from '../meta/save';
import type { KeyValueStore } from '../meta/saveStore';
import type { Backend } from '../net/backend';
import type { Portal } from '../platform/types';
import { diceName } from './boardPanel';

// The player's name on the boards (server/README.md "Names"). Nobody types one: a player
// signed in to a portal account (CrazyGames) goes by its name; a guest on a host with accounts
// stays off the boards; everyone else goes by a dice name, rolled on the first launch and rolled
// again with the die next to it in the lobby. The server hears the name whenever it changes (a
// roll, a sign-in, a renamed account) and with every run.

/** The last name the server took, so an unchanged one is not sent again. */
const SENT_KEY = 'hk.named';
/** Rolls in a row send only the last one, after this long. */
const SEND_AFTER_MS = 1500;

export class PlayerName {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly net: Pick<Backend, 'online' | 'sendName'>,
    private readonly storage: KeyValueStore,
    private readonly account: Pick<Portal, 'userName' | 'accounts'>,
  ) {}

  /** The save with a dice name, rolled now if it has none yet. */
  withDice(save: SaveData, random = Math.random): SaveData {
    return save.dice ? save : { ...save, dice: rollDice(random) };
  }

  /** The portal account's name as the boards take it, or null (then the die is offered). */
  portal(): string | null {
    const name = this.account.userName();
    const c = name ? checkName(name) : null;
    return c?.ok ? c.name : null;
  }

  /** Whether the player is on the boards: everywhere but as a guest on a host with accounts. */
  ranked(): boolean {
    return !this.account.accounts() || this.account.userName() !== null;
  }

  /** Whether the lobby offers the die: the player goes by a dice name. */
  rolls(): boolean {
    return this.ranked() && this.portal() === null;
  }

  /** The name the player's runs go out with; null keeps them off the boards. */
  board(save: SaveData): BoardName | null {
    if (!this.ranked()) return null;
    const portal = this.portal();
    return portal ? { name: portal } : save.dice ? { dice: save.dice } : null;
  }

  /** What the lobby shows. */
  shown(save: SaveData): string {
    if (!this.ranked()) return t('lobby.guest');
    return this.portal() ?? (save.dice ? diceName(save.dice) : t('lobby.guest'));
  }

  /** Tells the server the name once it changed, after a moment (rolls come in bursts). */
  sync(save: SaveData): void {
    const name = this.board(save);
    if (!this.net.online || !name) return;
    const key = JSON.stringify(name);
    clearTimeout(this.timer);
    if (this.storage.getItem(SENT_KEY) === key) return;
    this.timer = setTimeout(() => {
      void this.net.sendName(name).then((ok) => ok && this.storage.setItem(SENT_KEY, key));
    }, SEND_AFTER_MS);
  }
}
