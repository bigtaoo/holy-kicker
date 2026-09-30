"""Split a standing character sheet into cutout-animation parts.
usage: python split_parts.py <spec.json> <out dir>

spec.json:
  {
    "source": "hero_apose.png",           # relative to the spec file
    "parts": [                            # listed back to front
      {"name": "arm_r",
       "poly": [[x, y], ...],             # region of the source that belongs to this part
       "hidden": [[[x, y], ...], ...],    # optional: areas covered by other parts, filled in
       "pivot": [x, y]}                   # joint position in source pixels
    ]
  }

Every part keeps only foreground pixels (see cutout.background_mask). Hidden areas are
filled by OpenCV inpainting so a part still looks whole when a joint rotates.
Writes <name>.png per part, parts.json (size, pivot and source offset per part, so the rig
can rebuild the rest pose) and preview.png (the parts re-assembled over a checkerboard).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from cutout import background_mask  # noqa: E402

PAD = 4  # transparent margin around each exported part


def poly_mask(size, polys):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([tuple(v) for v in p], fill=255)
    return m


def split(spec_path, out_dir):
    spec = json.load(open(spec_path, encoding="utf-8"))
    src = Image.open(os.path.join(os.path.dirname(spec_path), spec["source"])).convert("RGB")
    fg = ImageChops.invert(background_mask(src))
    rgb = np.array(src)
    os.makedirs(out_dir, exist_ok=True)
    meta, layers = [], []
    for part in spec["parts"]:
        own = ImageChops.multiply(poly_mask(src.size, [part["poly"]]), fg)
        hidden = poly_mask(src.size, part.get("hidden", []))
        # fill the hidden area from the part's own pixels only: everything outside the part
        # is marked unknown, so no white paper or neighbouring part bleeds in
        rgba = rgb.copy()
        if hidden.getbbox():
            known = np.array(own) > 200
            fill = (np.array(hidden) > 0) & ~known
            unknown = (~known).astype(np.uint8) * 255
            painted = cv2.inpaint(rgba, unknown, 5, cv2.INPAINT_TELEA)
            rgba[fill] = painted[fill]
            alpha = np.maximum(np.array(own), np.array(hidden))
        else:
            alpha = np.array(own)
        im = Image.fromarray(np.dstack([rgba, alpha]).astype(np.uint8), "RGBA")
        x0, y0, x1, y1 = im.getbbox()
        x0, y0 = max(0, x0 - PAD), max(0, y0 - PAD)
        x1, y1 = min(src.width, x1 + PAD), min(src.height, y1 + PAD)
        im = im.crop((x0, y0, x1, y1))
        im.save(os.path.join(out_dir, part["name"] + ".png"), optimize=True)
        px, py = part["pivot"]
        meta.append({
            "name": part["name"],
            "w": im.width, "h": im.height,
            "x": x0, "y": y0,                   # top-left in source pixels
            "anchorX": round((px - x0) / im.width, 4),
            "anchorY": round((py - y0) / im.height, 4),
            "pivot": [px, py],
        })
        layers.append((im, x0, y0, px, py))
    json.dump({"source": spec["source"], "parts": meta},
              open(os.path.join(out_dir, "parts.json"), "w"), indent=2)
    preview(src.size, layers).save(os.path.join(out_dir, "preview.png"))


def preview(size, layers):
    w, h = size
    m = 120  # margin so the exploded view never lands at a negative offset
    board = Image.new("RGBA", (w * 2, h + 2 * m), (255, 255, 255, 255))
    d = ImageDraw.Draw(board)
    for y in range(0, h + 2 * m, 32):
        for x in range(0, w * 2, 32):
            if (x // 32 + y // 32) % 2:
                d.rectangle([x, y, x + 31, y + 31], fill=(210, 210, 210, 255))
    # left: rest pose; right: exploded view so seams and inpainting are visible
    cx = sum(l[3] for l in layers) / len(layers)
    cy = sum(l[4] for l in layers) / len(layers)
    for im, x0, y0, px, py in layers:
        board.alpha_composite(im, (x0, y0 + m))
        ex, ey = (px - cx) * 0.35, (py - cy) * 0.35
        board.alpha_composite(im, (int(x0 + w + ex), int(y0 + m + ey)))
    for _, _, _, px, py in layers:
        d.ellipse([px - 5, py + m - 5, px + 5, py + m + 5], outline=(255, 0, 0, 255), width=2)
    return board


if __name__ == "__main__":
    split(sys.argv[1], sys.argv[2])
