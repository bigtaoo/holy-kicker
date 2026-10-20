"""Repaint the squad's orange armour (docs/reskin.md "Armour colour").

The drawings give the corgi, the bulldog and the cat the same orange plates as their fur, so
the whole figure reads as one orange block. This moves the saturated warm pixels of the armour
parts to another colour and leaves the rest alone: the pale ones (the cream belly plate, the
paws' highlights), the gun's yellow-green glow, the black undersuit and the outline. The fur
(head, ears, tail) is simply not listed, so the warm colour stays on the dog.

A spec for split_parts.py names the paint per part, and split_parts applies it as it saves
each part, so a re-cut keeps the colour:

    "recolor": {"white": {"to": [35, 0.07, 0.4, 0.58], "parts": ["torso", "arm_f", ...]},
                "gunmetal": {"to": [215, 0.15, 0.4, 0.0], "parts": ["gun", "gun_n"]}}

`to` is [hue, saturation factor, value factor, value lift]: a moved pixel takes the hue, keeps
its saturation times the factor and its value times the factor plus the lift, so the drawing's
shading survives in the new colour. To try a paint on one image:

    python tools/recolor_armour.py art/reskin/corgi/parts/torso.png out.png 35,0.07,0.4,0.58
"""

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from recolor_cold import to_hsv, to_rgb  # noqa: E402


def recolor(im: Image.Image, to: list[float]) -> Image.Image:
    """Returns `im` (RGBA) with its saturated orange moved to `to` (see the module docstring)."""
    hue, sat, val, lift = to
    a = np.asarray(im.convert("RGBA")).astype(np.float64) / 255
    h, s, v = to_hsv(a[..., :3])
    paint = ((h <= 50) | (h >= 345)) & (s > 0.35) & (v > 0.2)
    h = np.where(paint, hue, h)
    s = np.where(paint, s * sat, s)
    v = np.where(paint, np.clip(v * val + lift, 0, 1), v)
    out = np.concatenate([to_rgb(h, s, v), a[..., 3:]], -1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def paint_for(spec: dict, name: str) -> list[float] | None:
    """The `to` a spec's "recolor" gives part `name`, or None."""
    for paint in spec.get("recolor", {}).values():
        if name in paint["parts"]:
            return paint["to"]
    return None


if __name__ == "__main__":
    src, dst, to = sys.argv[1:4]
    recolor(Image.open(src), [float(x) for x in to.split(",")]).save(dst, optimize=True)
    print(dst)
