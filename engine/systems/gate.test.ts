import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, HORDE, PACE, WAVES, type RunConfig } from '../config';
import { Engine } from '../Engine';
import type { PlayerCommand } from '../input';
import { MAG_FULL } from '../input';
import { hordeSize, holds, startAt } from './waves';

function run(chapter: number, hard = false): Engine {
  const e = new Engine({ ...DEFAULT_RUN, waves: 50, chapter, hard } satisfies RunConfig);
  e.state.players[0].hurtCd = 1e9;
  return e;
}

function cmd(e: Engine, moveMag = 0): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag };
}

/** Steps n ticks, taking the first card of any level-up; true once a wave began. */
function steps(e: Engine, n: number, moveMag = 0): boolean {
  let wave = false;
  for (let i = 0; i < n; i++) {
    const pick = e.state.players[0].offer.length > 0 ? { pick: 0 } : {};
    wave = e.step([{ ...cmd(e, moveMag), ...pick }]).some((ev) => ev.type === 'wave') || wave;
  }
  return wave;
}

describe('kill-gated waves', () => {
  it('hold a later chapter wave until its horde has been felled, up to the cap', () => {
    const e = run(PACE.from);
    const s = e.state;
    startAt(s, 3);
    steps(e, 1);
    expect(s.wave).toBe(3);
    s.waveT = WAVES.ticks - 1;
    s.waveKills = 0;
    expect(steps(e, 1)).toBe(false);
    expect(holds(s)).toBe(true);
    s.waveKills = Math.ceil((hordeSize(3, s.config.chapter) * PACE.gatePercent) / 100);
    expect(holds(s)).toBe(false);
    expect(steps(e, 1)).toBe(true);
    expect(s.wave).toBe(4);
    expect(s.waveKills).toBe(0);
    s.waveT = PACE.gateTicks - 1;
    expect(steps(e, 1)).toBe(true);
    expect(s.wave).toBe(5);
  });

  it('keep the fixed beat in the first chapters and in hard mode', () => {
    for (const e of [run(PACE.from - 1), run(PACE.from, true)]) {
      e.state.waveT = WAVES.ticks - 1;
      e.state.waveKills = 0;
      expect(holds(e.state)).toBe(false);
      expect(steps(e, 1)).toBe(true);
    }
  });
});

describe('outrun mobs', () => {
  /** A chaser starts off screen behind a hero walking away (+x) at half speed: does it ever get ahead of him? */
  function overtakes(chapter: number): boolean {
    const e = run(chapter);
    const s = e.state;
    const p = s.players[0];
    s.mobs.length = 1;
    const m = s.mobs[0];
    m.kind = 'chaser';
    m.x = m.px = p.x - HORDE.ringMin;
    m.y = m.py = p.y;
    for (let i = 0; i < PACE.lagTicks + PACE.lagEvery; i++) {
      steps(e, 1, MAG_FULL >> 1);
      if (m.x > p.x) return true;
    }
    return false;
  }

  it('come back ahead of the hero from chapter PACE.from on', () => {
    expect(overtakes(PACE.from)).toBe(true);
  });

  it('are left behind in the first chapters', () => {
    expect(overtakes(PACE.from - 1)).toBe(false);
  });
});
