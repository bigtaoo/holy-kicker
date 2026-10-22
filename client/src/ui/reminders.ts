import { Container } from 'pixi.js';
import { t } from '../i18n';
import { REMINDER_IDS, offerReminders, reminders, type ReminderId } from '../meta/reminders';
import type { SaveData } from '../meta/save';
import type { KeyValueStore } from '../meta/saveStore';
import { loadSettings, updateSettings } from '../meta/settings';
import type { Notifier } from '../platform/types';
import { COLORS, button, label, panel } from './widgets';

// The iOS app's reminders (meta/reminders.ts) between the lobby and the host's notifications:
// booked again whenever the lobby opens and whenever the game goes to the background, offered
// once by a card at the foot of the lobby after a run (never on a launch), and switched in settings.
// The system's sheet comes only from a tap on that card or on the switch.

/** What the lobby and the settings panel see. */
export interface ReminderUi {
  /** Whether the card is up: a few runs in, a run finished since launch, never answered. */
  offering(): boolean;
  /** The card's answer; yes brings up the system's sheet. */
  answer(yes: boolean): Promise<void>;
  /** The switch: 'blocked' when refused in the phone's settings, which only those can undo. */
  state(): 'on' | 'off' | 'blocked';
  set(on: boolean): Promise<void>;
}

export class ReminderBook implements ReminderUi {
  private readonly launchRuns: number;

  constructor(private readonly notify: Notifier, private readonly kv: KeyValueStore, private readonly save: () => SaveData) {
    this.launchRuns = save().runs;
  }

  /** Books what is due from now and cancels the rest. */
  sync(now = Date.now()): void {
    const s = loadSettings(this.kv);
    const due = s.reminders && this.notify.status() === 'on' ? reminders(this.save(), now, new Date(now).getTimezoneOffset()) : [];
    for (const id of REMINDER_IDS) {
      const r = due.find((d) => d.id === id);
      if (!r) this.notify.cancel(id);
      else this.notify.schedule(id, r.at, ...text(id));
    }
  }

  offering(): boolean {
    const save = this.save();
    return save.runs > this.launchRuns && offerReminders(save, this.notify.status(), loadSettings(this.kv).remindAsked);
  }

  async answer(yes: boolean): Promise<void> {
    updateSettings(this.kv, { remindAsked: true, reminders: yes });
    if (yes) await this.notify.ask();
    this.sync();
  }

  state(): 'on' | 'off' | 'blocked' {
    const status = this.notify.status();
    if (status === 'off') return 'blocked';
    return status === 'on' && loadSettings(this.kv).reminders ? 'on' : 'off';
  }

  async set(on: boolean): Promise<void> {
    updateSettings(this.kv, { remindAsked: true, reminders: on });
    if (on && this.notify.status() === 'unknown') await this.notify.ask();
    this.sync();
  }
}

/** `r` drawing the screen again once an answer or a switch has gone through. */
export function redrawn(r: ReminderUi, after: () => void): ReminderUi {
  return {
    offering: () => r.offering(),
    answer: (yes) => r.answer(yes).then(after),
    state: () => r.state(),
    set: (on) => r.set(on).then(after),
  };
}

/** A reminder's title and text, in the player's language as it is now. */
function text(id: ReminderId): [string, string] {
  if (id === 'patrol') return [t('remind.patrolTitle', { patrol: t('patrol.title') }), t('remind.patrolBody')];
  return [t('remind.dailyTitle'), t('remind.dailyBody')];
}

/** The lobby's card, centred on `y`: remind me, or no thanks. */
export function reminderCard(w: number, y: number, r: ReminderUi): Container {
  const card = new Container();
  card.position.set(w / 2, y);
  const ask = label(t('remind.offer', { patrol: t('patrol.title') }), 48, COLORS.text, { wordWrap: true, wordWrapWidth: 900, breakWords: true });
  const h = ask.height + 210;
  card.addChild(panel(1000, h));
  ask.y = -h / 2 + 30 + ask.height / 2;
  card.addChild(ask);
  const row = h / 2 - 85;
  const pick = (yes: boolean) => () => void r.answer(yes);
  const yes = button(t('remind.yes'), 420, 110, pick(true), { fill: COLORS.saffron, textFill: COLORS.outline, size: 48 });
  const no = button(t('remind.no'), 380, 110, pick(false), { fill: COLORS.panelLocked, size: 48 });
  yes.position.set(-210, row);
  no.position.set(220, row);
  card.addChild(yes, no);
  return card;
}
