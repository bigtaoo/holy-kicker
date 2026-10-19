"""Turn the corgi's warm art into Mecha-Biscuit's (the corgi theme's chapter 5 boss, docs/reskin.md).

Unlike recolor_cold.py, which turns every warm hue by one angle, this maps each warm family to
its own cold target, so the armour and the fur stay apart:

  armour  orange plates -> dark purple, cream -> cool pale grey, the gun's yellow glow -> red
  fur     orange fur    -> the grey-blue metal fur of the redrawn head, cream -> cool pale grey

Cold pixels and the black outline keep their colour; alpha is untouched, so a recoloured
drawing still fits the cut that split_parts.py makes from the original.

    python tools/recolor_mecha.py art/reskin/corgi/apose2.png body.png --mode armour
    python tools/recolor_mecha.py 238,128,44 --mode fur       # one colour (a spec's fill)
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from recolor_cold import to_hsv, to_rgb  # noqa: E402

# (target hue, saturation factor, value factor) for the saturated warm pixels
WARM = {"armour": (272, 0.62, 0.62), "fur": (212, 0.4, 0.72)}
PALE_HUE = 210  # cream and the paws' pink-grey become a grey with this cast
GLOW_HUE = 356  # the gun's yellow-green glow becomes red


def recolor(rgb: np.ndarray, mode: str) -> np.ndarray:
    """rgb: float array (..., 3) in 0..1. Returns the recoloured array."""
    h, s, v = to_hsv(rgb)
    warm = ((h <= 55) | (h >= 345)) & (s > 0.08) & (v > 0.12)
    pale = warm & (s < 0.35) & (v > 0.55)
    strong = warm & ~pale
    glow = (h > 55) & (h < 95) & (s > 0.35) & (v > 0.5)
    th, sf, vf = WARM[mode]
    h = np.where(strong, th, np.where(pale, PALE_HUE, np.where(glow, GLOW_HUE, h)))
    s = np.where(strong, s * sf, np.where(pale, s * 0.5, np.where(glow, np.maximum(s, 0.8), s)))
    v = np.where(strong, v * vf, np.where(pale, v * 0.82, np.where(glow, np.maximum(v, 0.9), v)))
    return to_rgb(h, s, v)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="an image, or one colour as r,g,b")
    ap.add_argument("dst", nargs="?")
    ap.add_argument("--mode", choices=sorted(WARM), default="armour")
    args = ap.parse_args()
    if "," in args.src and not os.path.exists(args.src):
        c = np.array([[float(x) / 255 for x in args.src.split(",")]])
        print([int(round(x)) for x in np.clip(recolor(c, args.mode)[0], 0, 1) * 255])
        return
    img = Image.open(args.src).convert("RGBA")
    a = np.asarray(img).astype(np.float64) / 255
    out = np.concatenate([recolor(a[..., :3], args.mode), a[..., 3:]], -1)
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(args.dst, optimize=True)
    print(args.dst)


if __name__ == "__main__":
    main()
