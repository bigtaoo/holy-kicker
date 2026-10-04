"""Packs the ground decorations into one sheet for the game, plus a soft round patch.
usage: python pack_deco.py <out dir> <img>...
Each image is cut out (cutout.py), trimmed and scaled so its longest side is MAX px, then
shelf-packed into <out dir>/deco.png with <out dir>/deco.json:
  {"frames": [{"name", "x", "y", "w", "h"}, ...]}
The last frame is "patch": a white disc with a soft edge, tinted in the game."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from cutout import cutout  # noqa: E402

MAX = 160
PATCH = 128
PAGE_W = 512
PAD = 2
PROP_COLORS = 192


def patch():
    """Alpha falls off smoothly from the middle; the outer rim is a little ragged so a
    stretched patch never reads as a circle."""
    yy, xx = np.mgrid[0:PATCH, 0:PATCH].astype(np.float32)
    c = (PATCH - 1) / 2
    ang = np.arctan2(yy - c, xx - c)
    rim = 1 + 0.08 * np.sin(ang * 3 + 0.7) + 0.05 * np.sin(ang * 5 + 2.1)
    r = np.hypot(xx - c, yy - c) / (c * rim)
    a = np.clip(1 - r, 0, 1) ** 0.7
    rgba = np.zeros((PATCH, PATCH, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def to_palette(page, patch_frame):
    """A 256-colour PNG like the baked mobs (bake_mob.py), a quarter of the RGBA size: 192
    colours for the props and 64 alpha steps of white for the soft patch, which a plain
    quantize would band into a few rings."""
    x, y, w, h = (patch_frame[k] for k in ("x", "y", "w", "h"))
    rgba = np.asarray(page.convert("RGBA")).copy()
    alpha = rgba[y:y + h, x:x + w, 3].astype(np.float32)
    rgba[y:y + h, x:x + w] = 0
    props = Image.fromarray(rgba, "RGBA").quantize(PROP_COLORS, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    pal = props.getpalette("RGBA")[: PROP_COLORS * 4]
    pal += [0] * (PROP_COLORS * 4 - len(pal))
    for k in range(256 - PROP_COLORS):
        pal += [255, 255, 255, round(k * 255 / (255 - PROP_COLORS))]
    idx = np.asarray(props).copy()
    idx[y:y + h, x:x + w] = PROP_COLORS + np.round(alpha / 255 * (255 - PROP_COLORS)).astype(np.uint8)
    out = Image.fromarray(idx, "P")
    out.putpalette(pal, "RGBA")
    return out


def main():
    out, srcs = Path(sys.argv[1]), sys.argv[2:]
    sprites = []
    for s in srcs:
        im = cutout(s)
        im = im.crop(im.getbbox())
        k = MAX / max(im.size)
        sprites.append((Path(s).stem, im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)))
    sprites.append(("patch", patch()))
    frames, x, y, row = [], PAD, PAD, 0
    for name, im in sprites:
        if x + im.width + PAD > PAGE_W:
            x, y, row = PAD, y + row + PAD, 0
        frames.append({"name": name, "x": x, "y": y, "w": im.width, "h": im.height})
        x += im.width + PAD
        row = max(row, im.height)
    page = Image.new("RGBA", (PAGE_W, y + row + PAD))
    for (_, im), f in zip(sprites, frames):
        page.alpha_composite(im, (f["x"], f["y"]))
    out.mkdir(parents=True, exist_ok=True)
    to_palette(page, frames[-1]).save(out / "deco.png", optimize=True)
    (out / "deco.json").write_text(json.dumps({"frames": frames}, indent=1))
    print(f"{len(frames)} frames, {page.size[0]}x{page.size[1]}, {(out / 'deco.png').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
