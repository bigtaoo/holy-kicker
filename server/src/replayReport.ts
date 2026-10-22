import type { RunStats, WaveStats } from './replayStats';

// RunStats as text for the operator (build/replays.mjs): one block per run, then a table
// across runs. Times as m:ss, damage by source largest first.

export interface RunMeta {
  id: string;
  /** host, theme, locale and the like, shown as given. */
  tags: string[];
  chapter: number;
  relic: string;
  monk: string;
  engine: number;
  /** Whether the replay ended on the state the client hashed. */
  hashOk: boolean;
  /** An earlier report of a run a later one also covers (same seed): left out of the totals. */
  earlier?: boolean;
  note: string;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const bySize = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '-';
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** The waves worth a row: every 5th, the first, the last, and any with a death or its health under 40 %. */
function shownWaves(r: RunStats): WaveStats[] {
  const deathWaves = new Set(r.deaths.map((d) => d.wave));
  return r.waves.filter((w, i) => i === 0 || i === r.waves.length - 1 || w.wave % 5 === 0 || w.hpMin < 40 || deathWaves.has(w.wave));
}

export function formatRun(m: RunMeta, r: RunStats): string[] {
  const out = [
    `== ${m.id}  ${m.tags.join(' ')}  ch${m.chapter} ${m.relic} ${m.monk}  engine ${m.engine}  ${m.hashOk ? 'hash ok' : 'HASH MISMATCH'}`,
  ];
  if (m.note) out.push(`   "${m.note}"`);
  out.push(
    `   ${mmss(r.seconds)} (down ${mmss(r.downSeconds)}) · ends ${r.outcome} on wave ${r.wave}, level ${r.level} · ${r.kills} kills · ${r.revives} revives`,
    `   health under 25 % for ${r.low}% of the time · stick: idle ${r.idle}% · circling ${r.circling}% of 10 s stretches · leading the horde ${r.leading}% of moving time`,
    `   damage: ${bySize(r.damage)}`,
  );
  for (const d of r.deaths) {
    out.push(`   DOWN ${mmss(d.at)} wave ${d.wave} by ${d.blow} (last 5 s: ${bySize(d.last)}) · ${d.near} near, ${d.sectors}/8 sides, moving ${d.moving}%`);
  }
  out.push('   wave    at  secs kills  dmg hpMin  lvl screen  near clump sides');
  for (const w of shownWaves(r)) {
    out.push(
      `   ${String(w.wave).padStart(4)} ${mmss(w.at).padStart(5)} ${String(w.seconds).padStart(5)} ${String(w.kills).padStart(5)} ${String(w.damage).padStart(4)}` +
      ` ${String(w.hpMin).padStart(5)} ${String(w.level).padStart(4)} ${String(w.onScreen).padStart(6)} ${String(w.near).padStart(5)} ${String(w.clump).padStart(4)}% ${String(w.sectors).padStart(5)}`,
    );
  }
  if (r.picks.length) {
    const took = new Map<string, number>();
    const offered = new Map<string, number>();
    for (const p of r.picks) {
      took.set(p.took, (took.get(p.took) ?? 0) + 1);
      for (const o of p.offered) offered.set(o, (offered.get(o) ?? 0) + 1);
    }
    const passed = [...offered].filter(([k]) => !took.has(k)).sort((a, b) => b[1] - a[1]);
    out.push(
      `   picks: ${r.picks.length}`,
      `     took: ${[...took].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(', ')}`,
      `     never took: ${passed.map(([k, n]) => `${k} (offered ${n})`).join(', ') || '-'}`,
    );
  }
  return out;
}

/** One row per run, to compare them at a glance. */
export function formatTable(rows: { m: RunMeta; r: RunStats }[]): string[] {
  const out = ['id                ch  time   end      wave  idle circle lead clump near sides  low deaths'];
  for (const { m, r } of rows) {
    const live = r.waves.filter((w) => w.seconds > 0);
    out.push(
      `${m.id.padEnd(16)}${m.earlier ? '*' : ' '} ${String(m.chapter).padStart(2)} ${mmss(r.seconds).padStart(6)}  ${r.outcome.padEnd(8)} ${String(r.wave).padStart(4)}` +
      ` ${String(r.idle).padStart(4)}% ${String(r.circling).padStart(5)}% ${String(r.leading).padStart(3)}% ${String(avg(live.map((w) => w.clump))).padStart(4)}%` +
      ` ${String(avg(live.map((w) => w.near * 10)) / 10).padStart(4)} ${String(avg(live.map((w) => w.sectors * 10)) / 10).padStart(5)}` +
      ` ${String(r.low).padStart(3)}% ${String(r.deaths.length).padStart(6)}`,
    );
  }
  if (rows.some((x) => x.m.earlier)) out.push('* an earlier report of the same run, left out of the totals');
  return out;
}

/** Each card across the runs: how often it was offered and taken, least taken first. */
export function formatPicks(rows: { m: RunMeta; r: RunStats }[]): string[] {
  const cards = new Map<string, { offered: number; took: number; runs: number }>();
  for (const { m, r } of rows) {
    if (m.earlier) continue;
    const seen = new Set<string>();
    for (const p of r.picks) {
      for (const o of p.offered) {
        const c = cards.get(o) ?? { offered: 0, took: 0, runs: 0 };
        c.offered++;
        if (o === p.took) c.took++;
        if (!seen.has(o)) { seen.add(o); c.runs++; }
        cards.set(o, c);
      }
    }
  }
  const list = [...cards].sort((a, b) => a[1].took / a[1].offered - b[1].took / b[1].offered || b[1].offered - a[1].offered);
  return ['card               offered  taken  rate  runs', ...list.map(([k, c]) =>
    `${k.padEnd(18)} ${String(c.offered).padStart(7)} ${String(c.took).padStart(6)} ${String(Math.round((100 * c.took) / c.offered)).padStart(4)}% ${String(c.runs).padStart(5)}`)];
}

/**
 * Each spell, passive and evolution in the runs' final builds: runs ending with it, how many
 * were won, and the wave they reached on average, against the runs without it. Runs still in
 * play when the replay ends (a quit) count as not won. `group` splits the runs, e.g. by chapter
 * band ('ch1-2'); rows are by group, then most runs first.
 */
export function formatBuilds(rows: { m: RunMeta; r: RunStats }[], group: (m: RunMeta) => string = () => 'all'): string[] {
  const out = ['group   card               runs  won  win%  wave | without: runs win%  wave'];
  const live = rows.filter((x) => !x.m.earlier && x.r.build);
  const groups = [...new Set(live.map((x) => group(x.m)))].sort();
  for (const g of groups) {
    const runs = live.filter((x) => group(x.m) === g);
    const cards = new Map<string, Set<number>>();
    runs.forEach(({ r }, i) => {
      const add = (k: string) => (cards.get(k) ?? cards.set(k, new Set()).get(k)!).add(i);
      for (const sp of r.build.spells) { add(`spell:${sp.id}`); if (sp.evolved) add(`evolve:${sp.id}`); }
      for (const ps of r.build.passives) add(`passive:${ps.id}`);
      if (r.build.awakened) add(`evolve:${r.build.relic}`);
    });
    const tally = (idx: number[]) => {
      const won = idx.filter((i) => runs[i].r.outcome === 'won').length;
      return { n: idx.length, won, rate: idx.length ? Math.round((100 * won) / idx.length) : 0, wave: avg(idx.map((i) => runs[i].r.wave)) };
    };
    for (const [k, set] of [...cards].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))) {
      const w = tally([...set]);
      const wo = tally(runs.map((_, i) => i).filter((i) => !set.has(i)));
      out.push(
        `${g.padEnd(7)} ${k.padEnd(18)} ${String(w.n).padStart(4)} ${String(w.won).padStart(4)} ${String(w.rate).padStart(4)}% ${String(w.wave).padStart(5)}` +
        ` | ${String(wo.n).padStart(13)} ${String(wo.rate).padStart(4)}% ${String(wo.wave).padStart(5)}`,
      );
    }
  }
  return out;
}
