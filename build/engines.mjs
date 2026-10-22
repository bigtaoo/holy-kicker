import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The engines of earlier ENGINE_VERSIONs, taken from git: each version's engine/ as it was in
// the last commit before the next bump, cached under the temp dir. Shared by the replay reader
// (build/replays.mjs) and the server's bundle (server/build.mjs), which carries the last few so a
// run recorded just before a deploy still re-simulates after it.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(tmpdir(), 'hk-engines');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });

/** The working tree's ENGINE_VERSION. */
export function currentVersion() {
  return Number(/ENGINE_VERSION = (\d+)/.exec(readFileSync(join(ROOT, 'engine', 'Engine.ts'), 'utf8'))[1]);
}

let commits;
/** Each ENGINE_VERSION's last commit: the parent of the commit that bumped it next; HEAD's own is null (the working tree). */
export function versionCommits() {
  if (commits) return commits;
  const bumps = git('log', '--format=%H', '-G', 'ENGINE_VERSION = [0-9]+', '--', 'engine/Engine.ts').trim().split('\n').filter(Boolean);
  const versionAt = (c) => Number(/ENGINE_VERSION = (\d+)/.exec(git('show', `${c}:engine/Engine.ts`))[1]);
  commits = new Map();
  // the newest bump is the working tree's version, or HEAD's when the tree bumps it again
  bumps.forEach((c, i) => commits.set(versionAt(c), i > 0 ? `${bumps[i - 1]}^` : versionAt(c) === currentVersion() ? null : 'HEAD'));
  return commits;
}

/** The engine/ directory of version `v` (the working tree's for the current one), or null when git does not have it. */
export function engineDir(v) {
  if (v === currentVersion()) return join(ROOT, 'engine');
  const commit = versionCommits().get(v);
  if (!commit) return null;
  const dir = join(CACHE, `e${v}`);
  if (!existsSync(join(dir, 'engine', 'index.ts')) || !existsSync(join(dir, 'tsconfig.base.json'))) {
    mkdirSync(dir, { recursive: true });
    execFileSync('sh', ['-c', `git archive ${commit} engine tsconfig.base.json | tar -x -C "${dir.replace(/\\/g, '/')}"`], { cwd: ROOT });
  }
  return join(dir, 'engine');
}
