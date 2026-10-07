// Records a store gameplay video with the dev server's ?autoplay&record switches (client/src/dev/recorder.ts).
// usage: node tools/record_video.mjs <landscape|portrait|phone> [--from 25] [--seconds 30] [--seed 7]
//        [--chapter 1] [--extra "&relic=staff"] [--out art/monk/store/video/raw]
// Needs `npm run dev` on port 5174. It opens the system Chrome in a window of its own (a hidden
// or throttled page stops drawing, so not the in-app browser and not a background tab), lets
// the bot rush to the --from wave, records --seconds of play at the shape's exact size and saves
// the file. tools/store_video.py cuts the store's files from the recordings.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const shape = args[0];
if (!['landscape', 'portrait', 'phone'].includes(shape)) {
  console.error('usage: node tools/record_video.mjs <landscape|portrait|phone> [--from N] [--seconds S] [--seed N] [--chapter N] [--extra "&k=v"] [--out dir]');
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const from = Number(opt('from', '25'));
const seconds = Number(opt('seconds', '30'));
const seed = opt('seed', '7');
const chapter = opt('chapter', '1');
const out = opt('out', 'art/monk/store/video/raw');
const url =
  `http://localhost:5174/?direct&autoplay&record=${seconds}&shape=${shape}&from=${from}` +
  `&chapter=${chapter}&seed=${seed}&quality=high${opt('extra', '')}`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--window-size=1000,800',
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 700 }, acceptDownloads: true });
  page.on('console', (m) => {
    if (m.text().startsWith('record:')) console.log(m.text());
  });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  console.log(`opening ${url}`);
  await page.goto(url);
  // the rush runs at 6x, about 2.5 s a wave; then the recording itself. A bot that falls on the
  // way would hold the death panel, so that fails the take instead of recording it.
  const download = await Promise.race([
    page.waitForEvent('download', { timeout: (from * 5 + seconds + 60) * 1000 }),
    page
      .waitForFunction(() => globalThis.__shell?.run?.rushing && __shell.run.engine.state.outcome !== 'playing', null, { polling: 500, timeout: 0 })
      .then(async () => {
        throw new Error(`the bot fell on wave ${await page.evaluate(() => __shell.run.engine.state.wave)}; try another --seed`);
      }),
  ]);
  mkdirSync(out, { recursive: true });
  const file = join(out, `${shape}-ch${chapter}-w${from}-s${seed}.${download.suggestedFilename().split('.').pop()}`);
  await download.saveAs(file);
  console.log(`saved ${file}`);
} finally {
  await browser.close();
}
