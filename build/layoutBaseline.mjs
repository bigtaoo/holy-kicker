// The layout sweep's baseline (build/layoutSweep.mjs, docs/layout-sweep.md): the findings the
// sweep accepts today, so it fails only on new ones and the count can only go down. A finding is
// keyed by viewport, screen, kind and its labels with every word holding a digit replaced by #, so
// a timer, a coin balance or the build's version changing between runs does not read as a new finding; its
// position is left out for the same reason. Repeats of a key are counted.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** A label with its words that hold a digit masked and its whitespace folded, as baseline keys hold it. */
const masked = (s) => s.replace(/\S*\d\S*/g, '#').replace(/\s+/g, ' ').trim();

/** The baseline key of one finding on one viewport's screen. */
export function keyOf(viewport, screen, f) {
  const b = f.kind === 'overlap' ? ` x "${masked(f.b)}"` : '';
  return `${viewport} ${screen} ${f.kind} "${masked(f.a)}"${b}`;
}

/** One line per finding, short enough to read in a terminal. */
export function describe(viewport, screen, f) {
  const r = (x) => `(${Math.round(x.x)},${Math.round(x.y)} ${Math.round(x.w)}x${Math.round(x.h)})`;
  const where = `${viewport} ${screen}`;
  switch (f.kind) {
    case 'offscreen': return `${where}: offscreen "${f.a}" ${r(f.rectA)}`;
    case 'tiny': return `${where}: under the design minimum "${f.a}" ${f.frac} units, ${f.b} ${r(f.rectA)}`;
    case 'small': return `${where}: under the CSS floor "${f.a}" ${f.frac} px, ${f.b} ${r(f.rectA)}`;
    case 'placeholder': return `${where}: placeholder text "${f.a}" ${r(f.rectA)}`;
    case 'covered': return `${where}: covered ${Math.round(f.frac * 100)}% "${f.a}" ${r(f.rectA)} by ${r(f.rectB)}`;
    case 'overflow': return `${where}: overflow "${f.a}" ${r(f.rectA)} out of ${r(f.rectB)}`;
    default: return `${where}: overlap ${Math.round(f.frac * 100)}% "${f.a}" ${r(f.rectA)} x "${f.b}" ${r(f.rectB)}`;
  }
}

/** Key -> count over the reports `[{ viewport, screen, findings }]`. */
export function tally(reports) {
  const counts = {};
  for (const r of reports) for (const f of r.findings) {
    const k = keyOf(r.viewport, r.screen, f);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export function readBaseline(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).findings ?? {} : {};
}

/**
 * Writes the baseline. Only the viewports and screens this sweep walked are replaced, so a run
 * of one viewport (`--only`) keeps every other viewport's entries.
 */
export function writeBaseline(file, counts, walked) {
  const kept = Object.entries(readBaseline(file)).filter(([k]) => !walked.has(k.split(' ').slice(0, 2).join(' ')));
  const all = Object.fromEntries([...kept, ...Object.entries(counts)].sort(([a], [b]) => a.localeCompare(b)));
  const note = 'Layout findings accepted today (build/layoutSweep.mjs, docs/layout-sweep.md). The sweep fails on any key not here or seen more often; fix, then `npm run sweep:layout -- --update`.';
  writeFileSync(file, JSON.stringify({ note, findings: all }, null, 2) + '\n');
  return Object.keys(all).length;
}

/**
 * Compares this run with the baseline on the screens it walked: `added` are findings over the
 * baseline's count, `gone` the baseline's that this run no longer saw (fixed, or a screen that
 * drew differently).
 */
export function compare(counts, baseline, walked) {
  const added = [];
  const gone = [];
  for (const [k, n] of Object.entries(counts)) if (n > (baseline[k] ?? 0)) added.push(`${k}${n > 1 ? ` (x${n}, baseline ${baseline[k] ?? 0})` : ''}`);
  for (const [k, n] of Object.entries(baseline)) {
    if (walked.has(k.split(' ').slice(0, 2).join(' ')) && (counts[k] ?? 0) < n) gone.push(k);
  }
  return { added, gone };
}
