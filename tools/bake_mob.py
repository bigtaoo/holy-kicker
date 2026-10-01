"""Bake a looping frame sequence for a mob from one cutout drawing, by warping regions.
usage: python bake_mob.py <spec.json> [--debug <out.png>]

Mobs are many and small, so instead of a runtime skeleton they get a few baked frames
(CLAUDE.md). Each frame warps the source with soft-edged deformers, then the frames are
shrunk to game size and packed into one sheet, followed by white copies for hit flashes.

spec.json (coordinates in pixels of the cut-out source, times are loop phase 0..1):
  {
    "source": "../style_r3/enemy_jiangshi_fix.png",  # relative to the spec file
    "out": "../../../client/public/art/mobs/jiangshi", # writes <out>.png and <out>.json
    "frames": 8, "fps": 14,
    "height": 160,                  # px of the source cut-out's height in the sheet
    "ground": [x, y],               # the feet; the sheet's anchor
    "pad": [left, top, right, bottom],
    "drop": [{"below": y, "hsv": [[lo, hi], ...]}],  # optional: paint to erase
    "body": {"dy": f, "sx": f, "sy": f},                     # whole figure, about ground
    "deform": [                                              # applied inside body space
      {"type": "rotate", "region": R, "pivot": [x, y], "angle": f},      # degrees, cw
      {"type": "move", "region": R, "dx": f, "dy": f},
      {"type": "wave", "region": R, "root": [x, y], "dir": [ux, uy],
       "length": px, "wavelength": px, "amp": f, "cycles": n}
    ]
  }
R is an ellipse {"c": [x, y], "r": [rx, ry], "feather": 0..1}; the deformer acts fully
inside and fades out over the outer `feather` fraction of the radius.
f is a number, {"sin": amp, "phase": p, "bias": b, "cycles": n}, or
{"keys": [[t, v], ...]} (looping, cosine-eased between keys).
"""
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from cutout import cutout  # noqa: E402


def value(f, t):
    if isinstance(f, (int, float)):
        return float(f)
    if "sin" in f:
        return f.get("bias", 0) + f["sin"] * math.sin(2 * math.pi * (f.get("cycles", 1) * t + f.get("phase", 0)))
    keys = sorted(f["keys"])
    keys = [[k[0] - 1, k[1]] for k in keys[-1:]] + keys + [[k[0] + 1, k[1]] for k in keys[:1]]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            s = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            return v0 + (v1 - v0) * (1 - math.cos(math.pi * s)) / 2
    return keys[0][1]


def weight(region, x, y):
    cx, cy = region["c"]
    rx, ry = region["r"]
    r = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    f = max(region.get("feather", 0.3), 1e-3)
    s = np.clip((1 - r) / f, 0, 1)
    return s * s * (3 - 2 * s)


def inverse(d, t, x, y):
    """Where the pixel now at (x, y) came from, before deformer d."""
    w = weight(d["region"], x, y)
    kind = d["type"]
    if kind == "rotate":
        px, py = d["pivot"]
        a = -math.radians(value(d["angle"], t)) * w
        c, s = np.cos(a), np.sin(a)
        return px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c
    if kind == "move":
        return x - w * value(d.get("dx", 0), t), y - w * value(d.get("dy", 0), t)
    if kind == "wave":
        ux, uy = d["dir"]
        n = math.hypot(ux, uy)
        ux, uy = ux / n, uy / n
        rx, ry = d["root"]
        along = np.clip(((x - rx) * ux + (y - ry) * uy) / d["length"], 0, 1)
        off = value(d["amp"], t) * along * np.sin(
            2 * math.pi * (d.get("cycles", 1) * t - along * d["length"] / d["wavelength"]))
        # displace across the tail: the normal is (-uy, ux)
        return x + w * off * uy, y - w * off * ux
    raise ValueError(f"unknown deformer {kind}")


def drop_paint(im, rules):
    """Erases matching paint below a line that touches the outside, e.g. a coloured ground
    shadow and the paper showing through it; the same colours inside the outline stay."""
    a = np.array(im)
    hsv = cv2.cvtColor(a[:, :, :3], cv2.COLOR_RGB2HSV)
    for r in rules:
        m = np.zeros(a.shape[:2], bool)
        for lo, hi in r["hsv"]:
            m |= cv2.inRange(hsv, np.array(lo, np.uint8), np.array(hi, np.uint8)) > 0
        m[: r["below"]] = False
        outside = a[:, :, 3] < 10
        _, labels = cv2.connectedComponents((m | outside).astype(np.uint8), connectivity=4)
        touching = np.unique(labels[outside])
        a[m & np.isin(labels, touching[touching > 0]), 3] = 0
    return Image.fromarray(a)


def bake(spec, base):
    src = cutout(os.path.join(base, spec["source"]))
    if "drop" in spec:
        src = drop_paint(src, spec["drop"])
    l, t_, r, b = spec["pad"]
    W, H = src.width + l + r, src.height + t_ + b
    # premultiplied, so warped and shrunk edges do not pick up the (white) hidden colour
    a = np.array(src).astype(np.float32) / 255
    a[:, :, :3] *= a[:, :, 3:]
    canvas = np.zeros((H, W, 4), np.float32)
    canvas[t_:t_ + src.height, l:l + src.width] = a
    gx, gy = spec["ground"][0] + l, spec["ground"][1] + t_
    shift = lambda p: [p[0] + l, p[1] + t_]  # noqa: E731
    deform = []
    for d in spec.get("deform", []):
        d = json.loads(json.dumps(d))
        d["region"]["c"] = shift(d["region"]["c"])
        for k in ("pivot", "root"):
            if k in d:
                d[k] = shift(d[k])
        deform.append(d)

    scale = spec["height"] / src.height
    fw, fh = round(W * scale), round(H * scale)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    body = spec.get("body", {})
    frames, lift = [], []
    for i in range(spec["frames"]):
        t = i / spec["frames"]
        sx, sy = value(body.get("sx", 1), t), value(body.get("sy", 1), t)
        x = gx + (xs - gx) / sx
        lift.append(round(-value(body.get("dy", 0), t) * scale, 1))
        y = gy + (ys - gy + lift[-1] / scale) / sy
        for d in reversed(deform):
            x, y = inverse(d, t, x, y)
        warped = cv2.remap(canvas, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        frames.append(cv2.resize(warped, (fw, fh), interpolation=cv2.INTER_AREA))

    n = len(frames)
    # hit-flash copies: the same frames as flat white silhouettes, in the same sheet so
    # flashing mobs still batch with the rest
    for f in frames[:n]:
        white = np.ones_like(f)
        white[:, :, :3] = f[:, :, 3:]
        white[:, :, 3] = f[:, :, 3]
        frames.append(white)
    cols = math.ceil(math.sqrt(len(frames) * fh / fw))
    rows = math.ceil(len(frames) / cols)
    sheet = np.zeros((rows * fh, cols * fw, 4), np.float32)
    for i, f in enumerate(frames):
        y0, x0 = (i // cols) * fh, (i % cols) * fw
        sheet[y0:y0 + fh, x0:x0 + fw] = f
    alpha = sheet[:, :, 3:]
    sheet[:, :, :3] = np.where(alpha > 1e-4, sheet[:, :, :3] / np.maximum(alpha, 1e-4), 0)
    out = Image.fromarray((np.clip(sheet, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    meta = {
        "frames": n, "flash": n, "cols": cols, "frameW": fw, "frameH": fh, "fps": spec["fps"],
        "anchor": [round(gx * scale, 1), round(gy * scale, 1)],
        # the cut-out's height in sheet px, and how high off the ground each frame floats
        "height": spec["height"], "lift": lift,
    }
    return out, meta


def debug_overlay(spec, base, path):
    """The cut-out with every deformer region drawn on it, for placing regions."""
    src = cutout(os.path.join(base, spec["source"]))
    im = Image.new("RGBA", src.size, (90, 120, 90, 255))
    im.alpha_composite(src)
    a = np.array(im)
    for i, d in enumerate(spec.get("deform", [])):
        rg = d["region"]
        colour = [(255, 60, 60), (60, 160, 255), (255, 220, 0), (255, 0, 255), (0, 255, 200)][i % 5]
        c = tuple(int(v) for v in rg["c"])
        cv2.ellipse(a, c, tuple(int(v) for v in rg["r"]), 0, 0, 360, (*colour, 255), 2)
        p = d.get("pivot", d.get("root"))
        if p:
            cv2.circle(a, tuple(int(v) for v in p), 6, (*colour, 255), -1)
        cv2.putText(a, str(i), c, cv2.FONT_HERSHEY_SIMPLEX, 1.2, (*colour, 255), 3)
    cv2.circle(a, tuple(int(v) for v in spec["ground"]), 8, (255, 255, 255, 255), -1)
    Image.fromarray(a).save(path)


if __name__ == "__main__":
    spec_path = sys.argv[1]
    base = os.path.dirname(os.path.abspath(spec_path))
    with open(spec_path, encoding="utf-8") as fh_:
        spec = json.load(fh_)
    if "--debug" in sys.argv:
        debug_overlay(spec, base, sys.argv[sys.argv.index("--debug") + 1])
        sys.exit()
    sheet, meta = bake(spec, base)
    out = os.path.normpath(os.path.join(base, spec["out"]))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    # flat sticker art survives a 256-colour palette, at about a fifth of the size
    sheet.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(out + ".png", optimize=True)
    with open(out + ".json", "w", encoding="utf-8") as fh_:
        json.dump(meta, fh_, indent=2)
    print(f"{out}.png {sheet.width}x{sheet.height}, {meta['frames']} frames of {meta['frameW']}x{meta['frameH']}")
