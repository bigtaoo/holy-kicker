// The build id the client reports to analytics (`build` on every batch): the package version and
// the commit it was built from, e.g. 0.0.1+61b33eb, so the dashboard can tell releases apart and
// compare their new players. A tree with uncommitted changes is marked `-dirty`.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { themeOf } from './theme.mjs';

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
  return `${version}+${sha}${git('status --porcelain --untracked-files=no -- ":/" ":(top,exclude)client/wechat/project.config.json"') ? '-dirty' : ''}`;
}

/**
 * The iOS web bundle's version (docs/ios.md "Hot updates"): `<MARKETING_VERSION>.<build>` for the
 * one inside a shell, `<shell>.<n>` for a hot update, from HK_BUNDLE_VERSION, which only the iOS
 * workflows set. 0.0.0 elsewhere, which turns the update check off.
 */
export const bundleVersion = () => process.env.HK_BUNDLE_VERSION || '0.0.0';

/**
 * Vite's `define` for them: `__HK_BUILD__` and `__HK_BUNDLE__` in the client, plus the art set
 * (`__HK_THEME__`) and its backend (`__HK_API__`), build/theme.mjs.
 */
export const buildDefine = (theme = 'monk') => ({
  __HK_BUILD__: JSON.stringify(buildId()),
  __HK_BUNDLE__: JSON.stringify(bundleVersion()),
  __HK_THEME__: JSON.stringify(theme),
  __HK_API__: JSON.stringify(themeOf(theme).api),
});
