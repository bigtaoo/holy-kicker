"""The patrol panel's scene art (art/monk/ui/patrol/README.md).
usage: python patrol_art.py <out dir> <panorama> <top>-<bottom> <prop>...
      writes <out dir>/patrol_far.jpg (the panorama's band from <top> to <bottom>, as shares
      of its height, made to loop: its ends cross-faded) and
      <out dir>/patrol_props.{png,json} (the props cut out and shelf-packed, frames named by file)"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from cutout import cutout  # noqa: E402

FAR_H = 384
FADE = 0.12
PROP_H = 220
PAGE_W = 1024
PAD = 2


def loop(src, band):
    """Cross-fades the last FADE of the width into the start, so the strip tiles."""
    im = Image.open(src).convert("RGB")
    top, bottom = (float(v) for v in band.split("-"))
    im = im.crop((0, round(im.height * top), im.width, round(im.height * bottom)))
    im = im.resize((round(im.width * FAR_H / im.height), FAR_H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    n = round(a.shape[1] * FADE)
    body, tail = a[:, : a.shape[1] - n], a[:, a.shape[1] - n :]
    w = np.linspace(0, 1, n, dtype=np.float32)[None, :, None]
    body[:, :n] = tail * (1 - w) + body[:, :n] * w
    return Image.fromarray(body.clip(0, 255).astype(np.uint8))


def pack(paths):
    ims = []
    for p in paths:
        im = cutout(p)
        s = PROP_H / max(im.width, im.height)
        ims.append((Path(p).stem, im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)))
    frames, x, y, row = [], 0, 0, 0
    for name, im in ims:
        if x + im.width > PAGE_W:
            x, y, row = 0, y + row + PAD, 0
        frames.append({"name": name, "x": x, "y": y, "w": im.width, "h": im.height})
        x, row = x + im.width + PAD, max(row, im.height)
    sheet = Image.new("RGBA", (PAGE_W, y + row), (0, 0, 0, 0))
    for (_, im), f in zip(ims, frames):
        sheet.paste(im, (f["x"], f["y"]))
    sheet = sheet.crop((0, 0, max(f["x"] + f["w"] for f in frames), sheet.height))
    return sheet, frames


def main():
    out = Path(sys.argv[1])
    loop(sys.argv[2], sys.argv[3]).save(out / "patrol_far.jpg", quality=82, optimize=True)
    sheet, frames = pack(sys.argv[4:])
    sheet.quantize(192, method=Image.Quantize.FASTOCTREE).save(out / "patrol_props.png", optimize=True)
    (out / "patrol_props.json").write_text(json.dumps({"frames": frames}))


if __name__ == "__main__":
    main()
