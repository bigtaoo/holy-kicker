import type { RunConfig } from './config';
import type { SimEvent } from './events';
import { SpatialGrid } from './grid';
import { LocalInputSource, type InputSource, type PlayerCommand } from './input';
import { toFp } from './math/fixed';
import { cosB, sinB, TRIG_ONE } from './math/trig';
import { body, createState, newPlayer, type SimState } from './state';
import { bossSystem, newBoss } from './systems/boss';
import { ballSystem } from './systems/combat';
import { dropGem, dropSystem } from './systems/drops';
import { hordeSystem, ringPoint } from './systems/horde';
import { applyInput, contactSystem, hurtPlayer, kickSystem, movePlayers } from './systems/players';
import { spellSystem } from './systems/spells';
import { threatSystem } from './systems/threats';

// The simulation: fixed 30 Hz steps over plain integer state, fed only by player commands.
// The system order below is part of the determinism contract (stepOrder in Engine.test.ts):
// changing it, or any rule inside a system, changes every replay, so bump ENGINE_VERSION.

export const ENGINE_VERSION = 2;

export const STEP_ORDER = [
  'input', 'movePlayers', 'horde', 'boss', 'kicks', 'balls', 'spells', 'threats', 'contact', 'drops',
] as const;

export class Engine {
  readonly state: SimState;
  private readonly grid: SpatialGrid;
  private events: SimEvent[] = [];

  constructor(config: RunConfig, readonly input: InputSource = new LocalInputSource()) {
    this.state = createState(config);
    this.grid = new SpatialGrid(toFp(config.sep));
    setup(this.state);
  }

  /** The next tick to be stepped; commands for it are submitted ahead of advance(). */
  get nextTick(): number {
    return this.state.tick + 1;
  }

  submit(cmd: PlayerCommand): void {
    this.input.submit(cmd);
  }

  /** Steps one tick if its commands are known; null while the input source stalls. */
  advance(): SimEvent[] | null {
    const cmds = this.input.take(this.nextTick);
    return cmds ? this.step(cmds) : null;
  }

  /** One tick with these commands (a player without one holds the last). */
  step(cmds: readonly PlayerCommand[]): SimEvent[] {
    const s = this.state;
    const events: SimEvent[] = (this.events = []);
    const hurt = (owner: number) => hurtPlayer(s, events, owner);
    s.tick++;
    // network order is not the sim's business: commands apply by owner
    applyInput(s, [...cmds].sort((a, b) => a.owner - b.owner));
    movePlayers(s);
    hordeSystem(s, this.grid);
    bossSystem(s, events, hurt);
    kickSystem(s, events);
    ballSystem(s, events);
    spellSystem(s, events);
    if (s.config.threats) threatSystem(s, events, hurt);
    contactSystem(s, events);
    dropSystem(s, events);
    return events;
  }

  /** The events of the last step. */
  get lastEvents(): readonly SimEvent[] {
    return this.events;
  }
}

/** Players at the origin, the horde on its ring, the elite and boss ahead, optional gems. */
function setup(s: SimState): void {
  const c = s.config;
  for (let i = 0; i < c.players; i++) s.players.push(newPlayer(i, i * toFp(120), 0));
  const p = s.players[0];
  for (let i = 0; i < c.mobs; i++) {
    const m = body(0, 0);
    ringPoint(s.ai, p.x, p.y, m);
    s.mobs.push(m);
  }
  if (c.elite) s.elite = body(toFp(300), toFp(-900));
  if (c.boss) s.boss = newBoss(toFp(-200), toFp(-1100));
  for (let i = 0; i < c.drops; i++) {
    const a = s.drop.int(65536);
    const r = toFp(300) + s.drop.int(toFp(2700));
    dropGem(s, Math.trunc((cosB(a) * r) / TRIG_ONE), Math.trunc((sinB(a) * r) / TRIG_ONE), 1);
  }
}
