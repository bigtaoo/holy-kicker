import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The image installs mongodb from deploy/package.json with no lockfile of its own (the box's deploy
// script ships a fixed set of files), so it pins every package under mongodb to the root lockfile's.
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const lock: Record<string, { version: string; dependencies?: Record<string, string> }> = json('../../package-lock.json').packages;
const deploy: { dependencies: Record<string, string>; overrides: Record<string, string> } = json('../deploy/package.json');

function tree(name: string, seen: Record<string, string> = {}): Record<string, string> {
  const p = lock[`node_modules/${name}`];
  if (!p || seen[name]) return seen;
  seen[name] = p.version;
  for (const d of Object.keys(p.dependencies ?? {})) tree(d, seen);
  return seen;
}

describe('the server image', () => {
  it('pins mongodb and everything under it to the lockfile', () => {
    const { mongodb, ...under } = tree('mongodb');
    expect(deploy.dependencies).toEqual({ mongodb });
    expect(deploy.overrides).toEqual(under);
  });

  it('runs on an exact Node image', () => {
    expect(readFileSync(new URL('../deploy/Dockerfile', import.meta.url), 'utf8')).toMatch(/^FROM node:\d+\.\d+\.\d+-alpine$/m);
  });
});
