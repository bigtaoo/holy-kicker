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
       "drop": true,                  # its pixels leave the figure (paper, a ground shadow)
       "not_hsv": [[h, s, v], [h, s, v]], "not_grow": 8,  # leaves paint in this OpenCV HSV
                                      #   range to others, and the outline within not_grow px of it
       "hidden": [[[x, y], ...]],     # covered at rest by parts in front: filled from the part's
                                      #   own colours, with the outline drawn again where it ends;
                                      #   an entry may be {"poly": [...], "fill": [r, g, b]}
       "pivot": [x, y]}
    ],
    "seal": 4,                        # optional: outline gaps up to twice this many px are closed
    "crumb": 400,                     # optional: bits of a part smaller than this (px) go to the
                                      #   part they touch most
    "clean": 4,                       # optional: spikes thinner than twice this (px) are cut
                                      #   off each posed frame before it is outlined again
    "fade": 5,                        # optional: px over which a cut through paint fades into
                                      #   the part behind it
    "underlap": 24,                   # optional: how far (px) each part runs on, flat, under
                                      #   the parts in front of it, so a turn opens no crack
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
    if holes:  # paper the spec seeds as a hole stays clear, however closed its mouth is
        _, comp = cv2.connectedComponents((np.array(bg) > 0).astype(np.uint8), connectivity=4)
        for fx, fy in holes:
            fg[comp == comp[round(fy * src.height), round(fx * src.width)]] = 0
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
    owned = _tidy(owned, rig.get("crumb", 400))
    dropped = {p["name"] for p in parts if p.get("drop")}
    parts = [p for p in parts if p["name"] not in dropped]
    union = np.zeros(fg.shape, bool)
    for name, m in owned.items():
        if name not in dropped:
            union |= m
    fg = union.astype(np.uint8) * 255
    soft = cv2.GaussianBlur(fg.astype(np.float32) / 255, (0, 0), 0.6)  # cutout.py's feather
    images = {}
    lap = rig.get("underlap", 24)
    # kept off the silhouette, where a turning part would carry it out past its neighbour
    inner = cv2.erode(fg, disc(max(6, lap // 2))) > 0
    for i, p in enumerate(parts):
        own = owned[p["name"]]
        entries = [h if isinstance(h, dict) else {"poly": h} for h in p.get("hidden", [])]
        hidden = (np.array(poly_mask(src.size, [h["poly"] for h in entries])) > 0) & (fg > 0) & ~own
        out = rgb.copy()
        # the strip under the parts in front, filled flat like a hidden area but with no outline
        # where it ends: it only shows in the crack a turning neighbour opens
        front = np.zeros(fg.shape, bool)
        for q in parts[i + 1:]:
            front |= owned[q["name"]]
        under = (cv2.dilate(own.astype(np.uint8), disc(lap)) > 0) & front & inner & ~own & ~hidden if lap else front & False
        fade = rig.get("fade", 5)
        if under.any():
            # flat, except a few px next to the part: there it keeps the drawing, so the fading
            # cut of the part in front blends into the same picture at rest
            close = under & (cv2.dilate(own.astype(np.uint8), disc(fade + 3)) > 0)
            out[under & ~close] = _paint(own, under, rgb, hsv)
        if hidden.any():
            # paint from the part's own colours only, not its outline or the neighbours
            # one flat colour, the part's commonest paint next to it: an inpaint smears the
            # shading and the neighbours' greys into a blur no sticker has
            out[hidden] = _paint(own, hidden, rgb, hsv)
            for h in entries:
                if "fill" in h:
                    out[hidden & (np.array(poly_mask(src.size, [h["poly"]])) > 0)] = h["fill"]
            solid = (own | hidden).astype(np.uint8)
            ring = (solid > 0) & (cv2.erode(solid, disc(OUTLINE // 2 + 1)) == 0) & hidden
            out[ring] = OUTLINE_RGB
        # a cut through paint fades into the part behind over a few px: a hard straight edge
        # shows as a line across the fur the moment the part turns
        behind = np.zeros(fg.shape, bool)
        for q in parts[:i]:
            behind |= owned[q["name"]]
        edge = soft
        if fade and behind.any():
            d = cv2.distanceTransform((~behind).astype(np.uint8), cv2.DIST_L2, 5)
            edge = np.minimum(soft, np.clip((d + 0.5) / fade, 0, 1))
        alpha = np.where(hidden | under, 1.0, np.where(own, edge, 0)).astype(np.float32)
        a = np.dstack([out.astype(np.float32) / 255 * alpha[..., None], alpha])
        images[p["name"]] = a
    return images, box[:2]


def _paint(own, region, rgb, hsv):
    """The flat colour a part's covered region takes: its commonest paint near the region,
    not its outline or the neighbours'. A mostly dark part (a shadow) keeps its dark."""
    known = own & (hsv[..., 2] >= DARK)
    if known.sum() < 0.3 * own.sum():
        known = own
    near = known & (cv2.dilate(region.astype(np.uint8), disc(40)) > 0)
    return _commonest(rgb[near if near.sum() > 50 else known if known.any() else own])


def _commonest(px):
    """The most common colour among these pixels, binned to 8 levels a channel."""
    q = (px // 32).astype(np.int32)
    keys = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    top = np.bincount(keys).argmax()
    return np.median(px[keys == top], axis=0).astype(np.uint8)


def _clean(frame, r=4):
    """The posed figure's silhouette without the spikes and crumbs a cut edge leaves when its
    part turns, closed where parts parted, and outlined again all round: a cut edge turned out
    has no outline of its own. A crack that opened inside takes the paint beside it; a hole
    too wide to be a crack (the ground seen between legs) stays open, outlined."""
    solid = (frame[..., 3] > 0.5).astype(np.uint8)
    kept = cv2.morphologyEx(solid, cv2.MORPH_OPEN, disc(r))
    kept = cv2.morphologyEx(kept, cv2.MORPH_CLOSE, disc(r))
    outside = np.pad(1 - kept, 1, constant_values=1)
    cv2.floodFill(outside, None, (0, 0), 2)
    hole = (outside[1:-1, 1:-1] != 2) & (kept == 0)
    wide = cv2.dilate(cv2.erode(hole.astype(np.uint8), disc(r + 3)), disc(r + 4)) > 0
    kept = ((kept > 0) | (hole & ~wide)).astype(np.uint8)
    soft = cv2.GaussianBlur(kept.astype(np.float32), (0, 0), 0.8)
    ring = (kept > 0) & (cv2.erode(kept, disc(OUTLINE // 2 + 1)) == 0)
    straight = frame[..., :3] / np.maximum(frame[..., 3:], 1e-4)
    gap = (kept > 0) & (frame[..., 3] < 0.5) & ~ring
    if gap.any():
        img = (np.clip(straight, 0, 1) * 255).astype(np.uint8)
        img = cv2.inpaint(img, gap.astype(np.uint8), 5, cv2.INPAINT_TELEA)
        straight[gap] = img[gap].astype(np.float32) / 255
    straight[ring] = np.array(OUTLINE_RGB, np.float32) / 255
    return np.dstack([straight * soft[..., None], soft]).astype(np.float32)


def _tidy(owned, crumb):
    """Crumbs a part's polygon cut off from the rest of it (a dash of outline, a sliver of the
    neighbour's paint) go to the part they touch most, and holes inside a part are its own: a
    crumb would fly off on its own and a hole would show the ground through it."""
    names = list(owned)
    for _ in range(2):
        for name in names:
            n, lab, stats, _c = cv2.connectedComponentsWithStats(owned[name].astype(np.uint8), connectivity=8)
            for k in range(1, n):
                if stats[k, cv2.CC_STAT_AREA] >= crumb:
                    continue
                bit = lab == k
                ring = (cv2.dilate(bit.astype(np.uint8), disc(3)) > 0) & ~bit
                best = max((o for o in names if o != name), key=lambda o: int((owned[o] & ring).sum()))
                if (owned[best] & ring).any():
                    owned[name] = owned[name] & ~bit
                    owned[best] = owned[best] | bit
    for name in names:
        m = owned[name].astype(np.uint8)
        outside = np.pad(1 - m, 1, constant_values=1)
        cv2.floodFill(outside, None, (0, 0), 2)
        hole = (outside[1:-1, 1:-1] != 2) & ~owned[name]
        for o in names:
            if o != name:
                hole &= ~owned[o]
        owned[name] = owned[name] | hole
    return owned


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
            if p["name"] not in images:
                continue
            m = place(p["name"]).copy()
            m[:2, 2] += shift
            layer = cv2.warpAffine(images[p["name"]], m[:2], (W, H), flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            frame = layer + frame * (1 - layer[:, :, 3:])
        frames.append(_clean(frame, rig.get("clean", 4)))
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
        if p["name"] not in images:
            continue
        im = images[p["name"]]
        for ox, oy in ((0, 100), (w + (p["pivot"][0] - cx) * 0.4, 100 + (p["pivot"][1] - cy) * 0.4)):
            m = np.float32([[1, 0, ox], [0, 1, oy]])
            layer = cv2.warpAffine(im, m, (w * 2, h + 200))
            board = layer + board * (1 - layer[:, :, 3:])
        cv2.circle(board, (int(p["pivot"][0]), int(p["pivot"][1]) + 100), 6, (1, 0, 0, 1), -1)
    Image.fromarray((np.clip(board, 0, 1) * 255).astype(np.uint8), "RGBA").save(out)
