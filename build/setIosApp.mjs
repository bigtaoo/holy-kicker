// Turns the committed iOS shell (Holy Kicker) into another app of client/src/platform/ios/apps.json,
// in place: `node build/setIosApp.mjs corgi`. Only the iOS workflows run it, on a fresh checkout,
// before `npx cap sync ios`; locally, `git checkout client/ios client/capacitor.config.ts` undoes it.
// `--print <field>` prints one value of the app instead (the workflows read the profile name and the
// OTA host this way). See iosApp.mjs.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICON, IOS_FILES, patchIos } from './iosApp.mjs';
import { ROOT } from './theme.mjs';

const APPS = JSON.parse(readFileSync(join(ROOT, 'client/src/platform/ios/apps.json'), 'utf8'));
const [theme, flag, field] = process.argv.slice(2);
const app = APPS[theme];
if (!app) {
  console.error(`usage: node build/setIosApp.mjs <${Object.keys(APPS).join('|')}> [--print <field>]`);
  process.exit(1);
}

if (flag === '--print') {
  if (!(field in app)) throw new Error(`apps.json ${theme} has no "${field}"`);
  console.log(typeof app[field] === 'string' ? app[field] : JSON.stringify(app[field]));
} else {
  const paths = Object.values(IOS_FILES);
  const texts = Object.fromEntries(paths.map((p) => [p, readFileSync(join(ROOT, p), 'utf8')]));
  const out = patchIos(texts, APPS.monk, app);
  for (const p of paths) if (out[p] !== texts[p]) writeFileSync(join(ROOT, p), out[p]);
  if (app.icon !== ICON) copyFileSync(join(ROOT, app.icon), join(ROOT, ICON));
  if (!app.adMob) console.log(`::warning::${theme} has no AdMob units in apps.json: this build shows Google's test ads (TestFlight only)`);
  const lender = Object.keys(APPS).find((k) => k !== theme && APPS[k].adMob && APPS[k].adMob.app === app.adMob?.app);
  if (lender) console.log(`::warning::${theme} borrows ${lender}'s AdMob units: its earnings count as ${lender}'s until it has units of its own`);
  console.log(`iOS shell set to ${theme}: ${app.bundleId} ${app.version}, "${app.homeName}" / "${app.homeNameZh}"`);
}
