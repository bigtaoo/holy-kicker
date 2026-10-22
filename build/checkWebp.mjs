// Fails if a PNG listed in client/src/webpArt.json has no WebP beside it, or one of another size
// (a re-exported sheet whose WebP was not rebuilt): rerun `python tools/webp.py`.
import { readFileSync } from 'node:fs';
import { imageSize } from './imageSize.mjs';

const art = (rel) => readFileSync(new URL(`../client/public/${rel}`, import.meta.url));
const { lossy, lossless } = JSON.parse(readFileSync(new URL('../client/src/webpArt.json', import.meta.url), 'utf8'));
const list = [...lossy, ...lossless];

let bad = 0;
for (const png of list) {
  const p = art(png);
  let w;
  try {
    w = art(png.replace(/\.png$/, '.webp'));
  } catch {
    console.error(`${png}: no WebP beside it`);
    bad++;
    continue;
  }
  const pSize = imageSize(p);
  const wSize = imageSize(w);
  if (pSize !== wSize) {
    console.error(`${png}: PNG ${pSize}, WebP ${wSize}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`webp: ${list.length} sheets match their PNGs`);
