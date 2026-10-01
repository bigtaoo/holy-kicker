"""Tones down the brightest, near-white parts of a baked mob sheet (bake_mob.py output):
a crowd of hundreds of white faces and talismans is a dense high-contrast lattice that is
tiring to look at. The white hit-flash copies are left alone.
usage: python soften_mob.py <sheet dir>/<name>   ->  writes <name>_soft.png next to it"""
import json
import sys

import numpy as np
from PIL import Image

# Lightness above KNEE is compressed by SQUEEZE, only where the colour is close to grey.
KNEE = 135
SQUEEZE = 0.3
MAX_CHROMA = 60


def main():
    base = sys.argv[1]
    meta = json.load(open(f"{base}.json"))
    im = Image.open(f"{base}.png").convert("RGBA")
    a = np.array(im).astype(np.float32)
    fw, fh, cols = meta["frameW"], meta["frameH"], meta["cols"]
    for i in range(meta["frames"]):
        x, y = (i % cols) * fw, (i // cols) * fh
        rgb = a[y:y + fh, x:x + fw, :3]
        light = rgb.mean(axis=2, keepdims=True)
        chroma = rgb.max(axis=2, keepdims=True) - rgb.min(axis=2, keepdims=True)
        over = np.clip(light - KNEE, 0, None)
        grey = np.clip(1 - chroma / MAX_CHROMA, 0, 1)
        rgb -= over * (1 - SQUEEZE) * grey
    out = f"{base}_soft.png"
    soft = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
    # palette like the bake output, so the sheet stays small
    soft.quantize(256, method=Image.Quantize.FASTOCTREE).save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
