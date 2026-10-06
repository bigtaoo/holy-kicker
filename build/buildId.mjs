// The build id the client reports to analytics (`build` on every batch): the package version and
// the commit it was built from, e.g. 0.0.1+61b33eb, so the dashboard can tell releases apart and
// compare their new players. A tree with uncommitted changes is marked `-dirty`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (args) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

export function buildId() {
  const { version } = JSON.parse(readFileSync(new URL('../client/package.json', import.meta.url), 'utf8'));
  const sha = git('rev-parse --short=7 HEAD');
  if (!sha) return version;
  return `${version}+${sha}${git('status --porcelain --untracked-files=no -- . ":(exclude)client/wechat/project.config.json"') ? '-dirty' : ''}`;
}

/** Vite's `define` for it: `__HK_BUILD__` in the client. */
export const buildDefine = () => ({ __HK_BUILD__: JSON.stringify(buildId()) });
