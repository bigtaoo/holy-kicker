"""Turn a re-drawn head (a new facial expression) into a swappable face part.
usage: python face_variant.py <spec.json> <parts dir> <variant image> <out.png>

The variant is usually an edit_image result of the head crop, so it is framed and scaled
differently. It is aligned to the source head by the skin area (skull width, height and
top), colour-matched to the source skin, cut with the face part's polygon and feathered,
and saved in the face part's rectangle, so it shares the anchor of the default face.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

from split_parts import poly_mask

FEATHER = 6  # px of soft edge, kept inside the polygon


def skin_mask(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    m = cv2.inRange(hsv, (0, 20, 170), (25, 140, 255))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    return lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])


def extent(mask):
    ys, xs = np.nonzero(mask)
    return xs.min(), xs.max(), ys.min(), ys.max()


def main(spec_path, parts_dir, variant_path, out_path):
    spec = json.load(open(spec_path, encoding="utf-8"))
    face = next(p for p in spec["parts"] if p["name"] == "face")
    meta = {p["name"]: p for p in json.load(open(os.path.join(parts_dir, "parts.json")))["parts"]}
    src = np.array(Image.open(os.path.join(os.path.dirname(spec_path), spec["source"])).convert("RGB"))
    h = meta["head"]
    head = src[h["y"]:h["y"] + h["h"], h["x"]:h["x"] + h["w"]]
    var = np.array(Image.open(variant_path).convert("RGB"))

    sx0, sx1, sy0, sy1 = extent(skin_mask(head))
    vx0, vx1, vy0, vy1 = extent(skin_mask(var))
    s = ((sx1 - sx0) / (vx1 - vx0) + (sy1 - sy0) / (vy1 - vy0)) / 2
    tx = h["x"] + (sx0 + sx1) / 2 - s * (vx0 + vx1) / 2
    ty = h["y"] + sy0 - s * vy0
    size = (src.shape[1], src.shape[0])
    warped = cv2.warpAffine(var, np.float32([[s, 0, tx], [0, s, ty]]), size,
                            flags=cv2.INTER_AREA, borderValue=(255, 255, 255))

    region = np.array(poly_mask(size, [face["poly"]])) > 0
    # shift the variant's skin tone onto the source's, measured inside the face region
    src_skin = skin_mask(src) & region
    var_skin = skin_mask(warped) & region
    delta = np.median(src[src_skin], 0) - np.median(warped[var_skin], 0)
    rgb = np.clip(warped.astype(np.float32) + delta, 0, 255).astype(np.uint8)

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * FEATHER + 1,) * 2)
    alpha = cv2.erode(region.astype(np.uint8) * 255, k)
    alpha = cv2.GaussianBlur(alpha, (0, 0), FEATHER / 2)
    # keep only the variant's face interior (skin with its eyes and mouth holes filled), so
    # its own head outline never shows where it does not line up with the source's
    inner = skin_mask(warped).astype(np.uint8) * 255
    contours, _ = cv2.findContours(inner, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(inner, contours, -1, 255, cv2.FILLED)
    inner = cv2.GaussianBlur(cv2.dilate(inner, k), (0, 0), FEATHER / 2)
    alpha = np.minimum(alpha, inner)
    f = meta["face"]
    box = np.s_[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]]
    Image.fromarray(np.dstack([rgb[box], alpha[box]]), "RGBA").save(out_path, optimize=True)
    print(f"scale {s:.3f}, skin shift {delta.round(1).tolist()}")


if __name__ == "__main__":
    main(*sys.argv[1:5])
