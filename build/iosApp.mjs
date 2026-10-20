// One iOS shell, two apps (docs/ios.md "Second app: Corgi Commando"). client/ios is committed as Holy
// Kicker; the corgi app is the same project with its own values written over Holy Kicker's just
// before a build: bundle id, version, home-screen names, AdMob ids, the ad-free product, the launch
// colour and the icon. The values live in client/src/platform/ios/apps.json, keyed by theme. Every
// edit names the Holy Kicker text it replaces and how often it occurs, and fails when it does not
// find exactly that, so a renamed line in the project breaks the build instead of shipping a
// half-corgi app. Writing monk over monk changes nothing (iosApp.test.ts).
//
// Pure: texts in, texts out. setIosApp.mjs does the files.

/** The files an app's values reach, from the repo root. */
export const IOS_FILES = {
  pbx: 'client/ios/App/App.xcodeproj/project.pbxproj',
  plist: 'client/ios/App/App/Info.plist',
  zhStrings: 'client/ios/App/App/zh-Hans.lproj/InfoPlist.strings',
  adMob: 'client/ios/App/App/AdMob.swift',
  store: 'client/ios/App/App/Store.swift',
  launch: 'client/ios/App/App/Base.lproj/LaunchScreen.storyboard',
  capConfig: 'client/capacitor.config.ts',
};

/** Where the icon is copied to; each app's `icon` names its source. */
export const ICON = 'client/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';

/**
 * Google's sample ids, for an app whose AdMob units do not exist yet (`adMob: null`): the shell runs
 * with test ads and `live = false`. Fine on TestFlight, never for the App Store (docs/ios.md).
 */
export const TEST_ADMOB = {
  app: 'ca-app-pub-3940256099942544~1458002511',
  rewarded: 'ca-app-pub-3940256099942544/1712485313',
  interstitial: 'ca-app-pub-3940256099942544/4411468910',
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** '#141816' → the storyboard's components, 4 decimals as Xcode writes them. */
const storyboardColor = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (v) => String(Number(v.toFixed(4)));
  return `red="${f(r)}" green="${f(g)}" blue="${f(b)}"`;
};

/** A literal edit: `from` occurs exactly `count` times in `file` and becomes `to`. */
const lit = (file, from, to, count = 1) => ({ file, find: new RegExp(esc(from), 'g'), to: () => to, count });

/** The edits that turn the shell for app `from` into the shell for app `to` (apps.json entries). */
export function iosEdits(from, to) {
  const ads = (app) => app.adMob ?? TEST_ADMOB;
  const [fa, ta] = [ads(from), ads(to)];
  const F = IOS_FILES;
  return [
    lit(F.pbx, `PRODUCT_BUNDLE_IDENTIFIER = ${from.bundleId};`, `PRODUCT_BUNDLE_IDENTIFIER = ${to.bundleId};`, 2),
    lit(F.pbx, `MARKETING_VERSION = ${from.version};`, `MARKETING_VERSION = ${to.version};`, 2),
    {
      file: F.plist,
      find: new RegExp(`(<key>CFBundleDisplayName</key>\\s*<string>)${esc(from.homeName)}(</string>)`, 'g'),
      to: (_m, a, b) => `${a}${to.homeName}${b}`,
      count: 1,
    },
    lit(F.plist, `<string>${fa.app}</string>`, `<string>${ta.app}</string>`),
    lit(F.zhStrings, `"CFBundleDisplayName" = "${from.homeNameZh}";`, `"CFBundleDisplayName" = "${to.homeNameZh}";`),
    lit(F.adMob, `live ? "${fa.rewarded}"`, `live ? "${ta.rewarded}"`),
    lit(F.adMob, `live ? "${fa.interstitial}"`, `live ? "${ta.interstitial}"`),
    lit(F.adMob, `private static let live = ${!!from.adMob}`, `private static let live = ${!!to.adMob}`),
    lit(F.store, `static let productIds = ["${from.adFree}"]`, `static let productIds = ["${to.adFree}"]`),
    lit(F.launch, `key="backgroundColor" ${storyboardColor(from.background)}`, `key="backgroundColor" ${storyboardColor(to.background)}`),
    lit(F.capConfig, `appId: '${from.bundleId}'`, `appId: '${to.bundleId}'`),
    lit(F.capConfig, `appName: '${from.name}'`, `appName: '${to.name}'`),
    lit(F.capConfig, `backgroundColor: '${from.background}'`, `backgroundColor: '${to.background}'`),
  ];
}

/** `texts` (path → content, every file of IOS_FILES) as app `to`; throws on an edit that misses. */
export function patchIos(texts, from, to) {
  const out = { ...texts };
  for (const e of iosEdits(from, to)) {
    const text = out[e.file];
    if (text === undefined) throw new Error(`iosApp: ${e.file} was not given`);
    const hits = text.match(e.find)?.length ?? 0;
    if (hits !== e.count) throw new Error(`iosApp: ${e.file} has ${hits} of ${e.find.source}, expected ${e.count}`);
    out[e.file] = text.replace(e.find, e.to);
  }
  return out;
}
