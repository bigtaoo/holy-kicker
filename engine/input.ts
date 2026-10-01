// Player input, the only thing that enters the simulation from outside once it is running.
//
// One command per player per tick: a move direction as a brad and a 0..255 magnitude, and
// the rare one-shot request (a revive).
// quantizeMove is the input edge: the one place a float controller sample is allowed, turned
// into integers here so every client, replay and broadcast agrees on the same values. The
// sim never calls it.
//
// An InputSource hands the engine each tick's commands. The local one never stalls; a network
// one (later) returns null until the server has confirmed the tick, so single player, online
// play and replays all run the same Engine.step.

export interface PlayerCommand {
  owner: number;
  tick: number;
  /** Move direction, brads. */
  moveBrad: number;
  /** Stick deflection, 0 (still) to 255 (full). */
  moveMag: number;
  /** Spends one of the player's revives if they are down (the death screen's rewarded ad). */
  revive?: boolean;
}

export const MAG_FULL = 255;

/** Turns a stick vector (length 0..1, longer is clamped) into an integer direction and size. */
export function quantizeMove(x: number, y: number): { moveBrad: number; moveMag: number } {
  const len = Math.hypot(x, y);
  if (len < 1e-3) return { moveBrad: 0, moveMag: 0 };
  const brad = Math.round((Math.atan2(y, x) / (2 * Math.PI)) * 65536) & 65535;
  return { moveBrad: brad, moveMag: Math.round(Math.min(1, len) * MAG_FULL) };
}

export interface InputSource {
  submit(cmd: PlayerCommand): void;
  /** The commands for `tick`, or null while they are not known yet (a network stall). */
  take(tick: number): readonly PlayerCommand[] | null;
}

/** Single player: commands are known as soon as they are made. Keeps them all for a replay. */
export class LocalInputSource implements InputSource {
  private readonly pending = new Map<number, PlayerCommand[]>();
  readonly history: PlayerCommand[] = [];

  submit(cmd: PlayerCommand): void {
    const list = this.pending.get(cmd.tick);
    if (list) list.push(cmd);
    else this.pending.set(cmd.tick, [cmd]);
    this.history.push(cmd);
  }

  take(tick: number): readonly PlayerCommand[] {
    const list = this.pending.get(tick) ?? [];
    this.pending.delete(tick);
    return list;
  }
}

/** Plays back a recorded command list. */
export class ReplayInputSource implements InputSource {
  private readonly byTick = new Map<number, PlayerCommand[]>();

  constructor(history: readonly PlayerCommand[]) {
    for (const c of history) {
      const list = this.byTick.get(c.tick);
      if (list) list.push(c);
      else this.byTick.set(c.tick, [c]);
    }
  }

  submit(): void {}

  take(tick: number): readonly PlayerCommand[] {
    return this.byTick.get(tick) ?? [];
  }
}
