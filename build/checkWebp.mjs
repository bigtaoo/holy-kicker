// Fails if a PNG listed in client/src/webpArt.json has no WebP beside it, or one of another size
// (a re-exported sheet whose WebP was not rebuilt): rerun `python tools/webp.py`.
import { readFileSync } from 'node:fs';

const art = (rel) => readFileSync(new URL(`../client/public/${rel}`, import.meta.url));
const list = JSON.parse(readFileSync(new URL('../client/src/webpArt.json', import.meta.url), 'utf8'));

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
  // tools/webp.py writes an extended WebP (VP8X) for art with alpha, a simple lossy one (VP8) for opaque art
  const kind = w.toString('ascii', 12, 16);
  const pSize = `${p.readUInt32BE(16)}x${p.readUInt32BE(20)}`;
  const wSize = kind === 'VP8X' ? `${w.readUIntLE(24, 3) + 1}x${w.readUIntLE(27, 3) + 1}`
    : kind === 'VP8 ' ? `${w.readUInt16LE(26) & 0x3fff}x${w.readUInt16LE(28) & 0x3fff}` : `a ${kind} chunk`;
  if (pSize !== wSize) {
    console.error(`${png}: PNG ${pSize}, WebP ${wSize}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`webp: ${list.length} sheets match their PNGs`);
