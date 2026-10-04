"""Stand-in sheets for chapter 5's mobs until their pictures are generated (monk.txt, shadow.txt):
an existing baked sheet recoloured, its flash frames left white.

    python standin.py shadow   # the fox, mirrored to face left, turned into dark violet smoke
    python standin.py monk     # the jiangshi, its teal turned slate violet

Writes client/public/art/ch5/mobs/<name>.{png,json}. Delete this once the real ones are baked.
"""

import colorsys
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / 'client/public/art/mobs'
DST = ROOT / 'client/public/art/ch5/mobs'


def recolor(rgb: np.ndarray, mode: str) -> np.ndarray:
    out = rgb.copy()
    lum = rgb.mean(-1) / 255
    if mode == 'shadow':
        # dark violet smoke from its luminance; the outline stays black
        lo = np.array([26, 18, 44], np.float64)
        hi = np.array([104, 82, 150], np.float64)
        k = np.clip((lum - 0.15) / 0.85, 0, 1)[..., None]
        col = lo + (hi - lo) * k
        return np.where((lum < 0.15)[..., None], rgb, col)
    flat = rgb.reshape(-1, 3) / 255
    res = np.empty_like(flat)
    for i, (r, g, b) in enumerate(flat):
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if s > 0.12 and 0.4 < h < 0.62:
            h = 0.74
        res[i] = colorsys.hsv_to_rgb(h, s * 0.85, v * 0.82)
    return (res * 255).reshape(out.shape)


def main() -> None:
    name = sys.argv[1]
    src = 'fox' if name == 'shadow' else 'jiangshi'
    meta = json.loads((SRC / f'{src}.json').read_text())
    img = np.asarray(Image.open(SRC / f'{src}.png').convert('RGBA')).astype(np.float64)
    fw, fh, cols = meta['frameW'], meta['frameH'], meta['cols']
    for f in range(meta['frames']):
        x, y = (f % cols) * fw, (f // cols) * fh
        cell = img[y:y + fh, x:x + fw]
        cell[..., :3] = recolor(cell[..., :3], name)
        if name == 'shadow':
            img[y:y + fh, x:x + fw] = cell[:, ::-1]
    if name == 'shadow':
        # the flash frames turn with it
        for f in range(meta['frames'], meta['frames'] + meta['flash']):
            x, y = (f % cols) * fw, (f // cols) * fh
            img[y:y + fh, x:x + fw] = img[y:y + fh, x:x + fw][:, ::-1].copy()
        meta['anchor'][0] = round(fw - meta['anchor'][0], 1)
    DST.mkdir(parents=True, exist_ok=True)
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGBA').quantize(256, method=Image.Quantize.FASTOCTREE)
    out.save(DST / f'{name}.png', optimize=True)
    (DST / f'{name}.json').write_text(json.dumps(meta, indent=2))
    print(DST / f'{name}.png')


if __name__ == '__main__':
    main()
