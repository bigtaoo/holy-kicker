"""Cut-out parts for a baked mob (bake_mob.py's "rig" spec key): the drawing is split into
parts that each turn, move and scale about their own joint, so a loop gets legs, sleeves and a
head that move on their own instead of one sheet warping. The frames still bake into the same
sheet, so the game draws them as before.

"rig" (coordinates in pixels of the source drawing, not the cut-out):
  {
    "parts": [                        # back to front: the draw order
      {"name": "leg_b", "parent": "root",
       "poly": [[x, y], ...],         # the region of the drawing it takes (absent: "rest")
       "rest": true,                  # takes every pixel no other part claimed
       "not_hsv": [[h, s, v], [h, s, v]], "not_grow": 8,  # leaves paint in this OpenCV HSV
                                      #   range to others, and the outline within not_grow px of it
       "hidden": [[[x, y], ...]],     # covered at rest by parts in front: filled from the part's
                                      #   own colours, with the outline drawn again where it ends;
                                      #   an entry may be {"poly": [...], "fill": [r, g, b]}
       "pivot": [x, y]}
    ],
    "seal": 4,                        # optional: outline gaps up to twice this many px are closed
    "claim": ["head", ...],           # optional: who takes contested pixels first (default:
                                      #   front to back)
    "bones": {"body": {"pivot": [x, y], "parent": "root"}},  # optional joints with no picture
    "anim": {"head": {"rot": f, "dx": f, "dy": f, "sx": f, "sy": f}}  # deg cw, source px
  }
The root is the whole figure: the spec's "body": {"dy": f} lifts it (and is the sheet's lift).
"""
import math

import cv2
import numpy as np
from PIL import Image, ImageChops

from cutout import background_mask
from split_parts import DARK, OUTLINE, OUTLINE_RGB, disc, poly_mask


def cut_parts(path, rig, holes=()):
    """Each part as a premultiplied float RGBA image the size of the drawing, and the cut-out's
    top-left in the drawing (bake_mob's cut-out coordinates start there)."""
    src = Image.open(path).convert("RGB")
    bg = background_mask(src, holes=holes)
    box = ImageChops.invert(bg).getbbox()
    fg = np.array(ImageChops.invert(bg))
    # paper the flood reached through a gap of a few px in the outline (a white sole on the
    # ground shadow) is the figure's: whatever a slightly closed silhouette encloses
    closed = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, disc(rig.get("seal", 4)))
    outside = np.pad((closed == 0).astype(np.uint8), 1, constant_values=1)
    cv2.floodFill(outside, None, (0, 0), 2)
    fg[outside[1:-1, 1:-1] != 2] = 255
    soft = cv2.GaussianBlur(fg.astype(np.float32) / 255, (0, 0), 0.6)  # cutout.py's feather
    rgb = np.array(src)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    parts = rig["parts"]
    by_name = {p["name"]: p for p in parts}
    order = rig.get("claim") or [p["name"] for p in reversed(parts)]
    owned, taken = {}, np.zeros(fg.shape, bool)
    for name in order:
        p = by_name[name]
        if p.get("rest"):
            continue
        m = (np.array(poly_mask(src.size, [p["poly"]])) > 0) & (fg > 0) & ~taken
        if "not_hsv" in p:
            lo, hi = (np.array(v, np.uint8) for v in p["not_hsv"])
            other = cv2.inRange(hsv, lo, hi)
            g = p.get("not_grow", 0)
            near = cv2.dilate(other, disc(g)) > 0 if g else other > 0
            m &= ~((other > 0) | (near & (hsv[..., 2] < DARK)))
        owned[name] = m
        taken |= m
    for p in parts:
        if p.get("rest"):
            owned[p["name"]] = (fg > 0) & ~taken
    images = {}
    for p in parts:
        own = owned[p["name"]]
        entries = [h if isinstance(h, dict) else {"poly": h} for h in p.get("hidden", [])]
        hidden = (np.array(poly_mask(src.size, [h["poly"] for h in entries])) > 0) & (fg > 0) & ~own
        out = rgb.copy()
        if hidden.any():
            # paint from the part's own colours only, not its outline or the neighbours
            known = own & (hsv[..., 2] >= DARK)
            painted = cv2.inpaint(rgb, (~known).astype(np.uint8) * 255, 7, cv2.INPAINT_TELEA)
            out[hidden] = painted[hidden]
            for h in entries:
                if "fill" in h:
                    out[hidden & (np.array(poly_mask(src.size, [h["poly"]])) > 0)] = h["fill"]
            solid = (own | hidden).astype(np.uint8)
            ring = (solid > 0) & (cv2.erode(solid, disc(OUTLINE // 2 + 1)) == 0) & hidden
            out[ring] = OUTLINE_RGB
        alpha = np.where(hidden, 1.0, np.where(own, soft, 0)).astype(np.float32)
        a = np.dstack([out.astype(np.float32) / 255 * alpha[..., None], alpha])
        images[p["name"]] = a
    return images, box[:2]


def matrix(rot, dx, dy, sx, sy, pivot):
    """3x3: scale and turn (deg cw) about the pivot, then move."""
    px, py = pivot
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    a = np.array([[c * sx, -s * sy], [s * sx, c * sy]])
    m = np.eye(3)
    m[:2, :2] = a
    m[:2, 2] = np.array([px + dx, py + dy]) - a @ np.array([px, py])
    return m


def rig_frames(spec, path, value, pads, size, count):
    """`count` premultiplied frames of size (W, H): the posed parts, drawn back to front, with
    the cut-out's top-left at `pads` (left, top) as bake_mob.py places it."""
    rig = spec["rig"]
    images, (bx, by) = cut_parts(path, rig, spec.get("holes", ()))
    shift = np.array([pads[0] - bx, pads[1] - by], np.float64)
    joints = {p["name"]: p for p in rig["parts"]}
    joints.update(rig.get("bones", {}))
    W, H = size
    root_dy = spec.get("body", {}).get("dy", 0)
    frames = []
    for i in range(count):
        t = i / count
        world = {"root": matrix(0, 0, value(root_dy, t), 1, 1, (0, 0))}

        def place(name):
            if name not in world:
                j = joints[name]
                k = rig.get("anim", {}).get(name, {})
                ch = lambda c, d: value(k.get(c, d), t)  # noqa: E731
                local = matrix(ch("rot", 0), ch("dx", 0), ch("dy", 0), ch("sx", 1), ch("sy", 1), j["pivot"])
                world[name] = place(j.get("parent", "root")) @ local
            return world[name]

        frame = np.zeros((H, W, 4), np.float32)
        for p in rig["parts"]:
            m = place(p["name"]).copy()
            m[:2, 2] += shift
            layer = cv2.warpAffine(images[p["name"]], m[:2], (W, H), flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            frame = layer + frame * (1 - layer[:, :, 3:])
        frames.append(frame)
    return frames


def preview(spec, path, out):
    """The parts pulled apart over grey, joints marked: for placing polygons and pivots."""
    images, _ = cut_parts(path, spec["rig"], spec.get("holes", ()))
    h, w = next(iter(images.values())).shape[:2]
    pivots = [p["pivot"] for p in spec["rig"]["parts"]]
    cx, cy = np.mean([v[0] for v in pivots]), np.mean([v[1] for v in pivots])
    board = np.zeros((h + 200, w * 2, 4), np.float32)
    board[..., :3], board[..., 3] = 0.45, 1
    for p in spec["rig"]["parts"]:
        im = images[p["name"]]
        for ox, oy in ((0, 100), (w + (p["pivot"][0] - cx) * 0.4, 100 + (p["pivot"][1] - cy) * 0.4)):
            m = np.float32([[1, 0, ox], [0, 1, oy]])
            layer = cv2.warpAffine(im, m, (w * 2, h + 200))
            board = layer + board * (1 - layer[:, :, 3:])
        cv2.circle(board, (int(p["pivot"][0]), int(p["pivot"][1]) + 100), 6, (1, 0, 0, 1), -1)
    Image.fromarray((np.clip(board, 0, 1) * 255).astype(np.uint8), "RGBA").save(out)
