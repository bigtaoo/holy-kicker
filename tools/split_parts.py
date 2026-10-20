"""Split a standing character sheet into cutout-animation parts.
usage: python split_parts.py <spec.json> <out dir>

spec.json:
  {
    "source": "hero_apose.png",           # relative to the spec file
    "background": [[[x, y], ...], ...],   # optional: enclosed paper to treat as background
    "exclusive": true,                    # optional: a pixel belongs to the frontmost part
                                          #   whose region claims it
    "overlap": 5,                         # optional: px each part reaches under the parts in
                                          #   front of it (in its own edge colours), so no seam
                                          #   shows at rest
    "clean_edges": true,                  # optional: the figure's outer edge becomes outline
                                          #   colour with alpha from darkness (no light fringe)
    "sources": {"face.png": {"scale": 0.8, "from": [x, y], "to": [x, y]}},
                                          # optional: other drawings parts may be cut from,
                                          #   scaled so `from` (own pixels) lands on `to`
    "parts": [                            # listed back to front
      {"name": "arm_r",
       "source": "face.png",              # optional: cut from one of `sources`; poly, hidden,
                                          #   caps and pivot are then in its pixels
       "poly": [[x, y], ...],             # region of the source that belongs to this part
       "stroke": {"line": [[x, y], ...], "width": w},  # optional: thick polyline, added
       "hsv": [[h, s, v], [h, s, v]],     # optional: keep only pixels in this OpenCV HSV
       "grow": 6,                         #   range, grown into dark outline pixels by this many px
       "exclude": [[[x, y], ...], ...],   # optional: areas removed from the part
       "exclude_parts": ["skirt"],        # optional: pixels owned by other parts, removed
       "hidden": [[[x, y], ...], ...],    # optional: areas covered by other parts, filled in;
                                          #   an entry may be {"poly": [...], "fill": [r, g, b]}
       "caps": [[x, y, r], ...],          # optional: discs filled like hidden, not clipped to
                                          #   the silhouette (round joint ends)
       "fill": [r, g, b],                 # optional: flat colour for hidden areas (else inpaint)
       "edge": 6,                         # optional: outline drawn along cuts into the figure
       "pivot": [x, y],                   # joint position in source pixels
       "faces": {"head_hurt": "face_hurt.png"},  # optional: variants of the part from redraws
       "face_zone": [x, y, rx, ry]},      #   of its drawing (same canvas), taking only what
                                          #   changed inside this ellipse (eyes, mouth)
      {"name": "gun",                     # or a prop drawn on its own sheet: cut out, scaled
       "image": "gun.png", "scale": 0.2,  #   and placed so its `grip` (own pixels) lands on
       "grip": [800, 500], "pivot": [x, y]}  #   the pivot
    ],
    "recolor": {"white": {"to": [h, s, v, lift], "parts": ["torso"]}}
                                          # optional: repaints the orange of the parts named
                                          #   (tools/recolor_armour.py)
  }

Parts cut from the same drawing claim pixels from each other (exclusive, overlap); parts from
another drawing do not see them. Every part keeps only foreground pixels (see cutout.background_mask). Hidden areas are
filled with a flat colour or by OpenCV inpainting so a part still looks whole when a joint
rotates; where a fill becomes the part's edge, the outline is drawn again.
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
from recolor_armour import paint_for, recolor  # noqa: E402

PAD = 4  # transparent margin around each exported part
DARK = 80  # HSV value below this counts as outline, not paint
OUTLINE = 7  # px of outline redrawn along filled edges (matches the source art)
OUTLINE_RGB = (28, 20, 16)


def poly_mask(size, polys):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([tuple(v) for v in p], fill=255)
    return m


def disc_mask(size, caps):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    for x, y, r in caps:
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return np.array(m)


def disc(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1,) * 2)


def nearest_colours(rgb, src_mask):
    """For every pixel, the colour of the nearest pixel in src_mask."""
    _, lab = cv2.distanceTransformWithLabels((src_mask == 0).astype(np.uint8), cv2.DIST_L2, 5,
                                             labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(src_mask)  # labels number the zero pixels in scan order, from 1
    return rgb[ys[lab - 1], xs[lab - 1]]


def clean_silhouette(rgb, fg, width=3):
    """Outline colour along the figure's outer edge, with alpha from darkness so the
    anti-aliased grey between the black outline and the paper does not show as a fringe."""
    inside = cv2.distanceTransform(fg, cv2.DIST_L2, 5)
    band = (fg > 0) & (inside <= width)
    light = rgb.astype(np.float32).mean(axis=2)
    alpha = np.full(fg.shape, 255.0, np.float32)
    alpha[band] = np.clip((235 - light[band]) / (235 - 90), 0, 1) * 255
    out = rgb.copy()
    out[band] = OUTLINE_RGB
    return out, alpha


def region_mask(src, hsv, part):
    """Pixels a part claims before other parts are subtracted (uint8 array, 0 or 255)."""
    m = poly_mask(src.size, [part["poly"]] if "poly" in part else [])
    if "stroke" in part:
        d = ImageDraw.Draw(m)
        pts = [tuple(v) for v in part["stroke"]["line"]]
        w = part["stroke"]["width"]
        d.line(pts, fill=255, width=w)
        for x, y in pts:  # round joints
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    m = np.array(m)
    if "hsv" in part:
        lo, hi = (np.array(v, np.uint8) for v in part["hsv"])
        keep = cv2.inRange(hsv, lo, hi)
        g = part.get("grow", 0)
        if g:
            # grow only into dark pixels, i.e. take the part's own outline but no neighbour paint
            grown = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * g + 1,) * 2))
            keep = np.maximum(keep, np.minimum(grown, (hsv[..., 2] < DARK).astype(np.uint8) * 255))
        m = np.minimum(m, keep)
    m = np.minimum(m, np.array(poly_mask(src.size, part.get("exclude", []))) ^ 255)
    return m


def split(spec_path, out_dir):
    spec = json.load(open(spec_path, encoding="utf-8"))
    here = os.path.dirname(spec_path)
    main = spec["source"]
    size = Image.open(os.path.join(here, main)).size
    groups = {}
    for p in spec["parts"]:
        if "image" not in p:
            groups.setdefault(p.get("source", main), []).append(p)
    cuts = {}
    for name, parts in groups.items():
        background = spec.get("background", []) if name == main else []
        cuts.update(cut(os.path.join(here, name), parts, spec, background))
    os.makedirs(out_dir, exist_ok=True)
    meta, layers = [], []
    for part in spec["parts"]:
        if "image" in part:
            im, x0, y0 = prop(os.path.join(here, part["image"]), part, spec.get("clean_edges"))
            im = repaint(spec, part, im)
            save_part(out_dir, part, part["pivot"], im, x0, y0, meta, layers)
            continue
        im = cuts[part["name"]]
        box = im.getbbox()
        box = (max(0, box[0] - PAD), max(0, box[1] - PAD), min(im.width, box[2] + PAD), min(im.height, box[3] + PAD))
        x0, y0 = box[:2]
        pivot = part["pivot"]
        k = 1
        if "source" in part and part["source"] != main:
            place = spec["sources"][part["source"]]
            k, (fx, fy), (tx, ty) = place["scale"], place["from"], place["to"]
            x0, y0 = round(tx + (x0 - fx) * k), round(ty + (y0 - fy) * k)
            pivot = [round(tx + (pivot[0] - fx) * k), round(ty + (pivot[1] - fy) * k)]

        def placed(im):
            im = im.crop(box)
            if k != 1:
                im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            return repaint(spec, part, im)

        save_part(out_dir, part, pivot, placed(im), x0, y0, meta, layers)
        for name in part.get("faces", {}):
            # a variant shares its part's frame (tools/pack_tao.py "variants")
            placed(cuts[name]).save(os.path.join(out_dir, name + ".png"), optimize=True)
    json.dump({"source": main, "parts": meta},
              open(os.path.join(out_dir, "parts.json"), "w"), indent=2)
    preview(size, layers).save(os.path.join(out_dir, "preview.png"))


def cut(path, parts, spec, background):
    """Cuts parts out of one drawing; returns each as a full-size RGBA image."""
    src = Image.open(path).convert("RGB")
    fg = np.array(ImageChops.invert(background_mask(src)))
    rgb = np.array(src)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    # paper enclosed by the figure (e.g. between an arm and the body) is not border-connected,
    # so the spec marks those spots; light grey pixels inside them become background
    paper = (hsv[..., 1] < 30) & (hsv[..., 2] > 200)
    fg[(np.array(poly_mask(src.size, background)) > 0) & paper] = 0
    owned = {p["name"]: np.minimum(region_mask(src, hsv, p), fg) for p in parts}
    if spec.get("exclusive"):
        taken = np.zeros_like(fg)
        for p in reversed(parts):
            owned[p["name"]] = np.minimum(owned[p["name"]], taken ^ 255)
            taken = np.maximum(taken, owned[p["name"]])
    if spec.get("clean_edges"):
        rgb, edge_alpha = clean_silhouette(rgb, fg)
    order = [p["name"] for p in parts]
    out = {}
    for part in parts:
        own = owned[part["name"]]
        for other in part.get("exclude_parts", []):
            own = np.minimum(own, owned[other] ^ 255)
        # hidden areas are covered by other parts at rest, so they never reach past the
        # silhouette; caps are joint ends that may reach under a neighbour's outline
        entries = [h if isinstance(h, dict) else {"poly": h} for h in part.get("hidden", [])]
        hidden = np.minimum(np.array(poly_mask(src.size, [h["poly"] for h in entries])), fg)
        hidden = np.maximum(hidden, disc_mask(src.size, part.get("caps", [])))
        rgba = rgb.copy()
        alpha = np.maximum(own, hidden)
        fill = (hidden > 0) & (own <= 200)
        if fill.any():
            if "fill" in part:
                rgba[fill] = part["fill"]
                for h in entries:
                    if "fill" in h:
                        rgba[fill & (np.array(poly_mask(src.size, [h["poly"]])) > 0)] = h["fill"]
            else:
                # paint from the part's own colours only (not its outline), so neither paper,
                # neighbouring parts nor smeared black lines bleed in
                known = (own > 200) & (hsv[..., 2] >= DARK)
                painted = cv2.inpaint(rgba, (~known).astype(np.uint8) * 255, 5, cv2.INPAINT_TELEA)
                rgba[fill] = painted[fill]
            # where the filled area becomes the part's edge, draw the sticker outline again
            solid = (alpha > 127).astype(np.uint8)
            ring = (solid > 0) & (cv2.erode(solid, disc(OUTLINE)) == 0) & fill
            rgba[ring] = OUTLINE_RGB
        if spec.get("overlap") and own.any():
            # reach a few px under the parts in front, in this part's own edge colours
            front = np.zeros_like(fg)
            for other in order[order.index(part["name"]) + 1:]:
                if other in owned:
                    front = np.maximum(front, owned[other])
            band = cv2.dilate((own > 0).astype(np.uint8), disc(spec["overlap"])) > 0
            band &= (front > 0) & (alpha == 0)
            if band.any():
                rgba[band] = nearest_colours(rgb, own > 0)[band]
                alpha = np.where(band, 255, alpha).astype(np.uint8)
        if part.get("edge"):
            # an outline along cuts into the figure, for parts whose cut shows over others
            solid = (alpha > 127).astype(np.uint8)
            outside = ((solid == 0) & (fg > 0)).astype(np.uint8)
            rgba[(solid > 0) & (cv2.dilate(outside, disc(part["edge"])) > 0)] = OUTLINE_RGB
        if spec.get("clean_edges"):
            alpha = np.minimum(cv2.GaussianBlur(alpha, (3, 3), 0).astype(np.float32), edge_alpha)
        out[part["name"]] = Image.fromarray(np.dstack([rgba, alpha]).astype(np.uint8), "RGBA")
        for name, face in part.get("faces", {}).items():
            redraw = np.array(Image.open(os.path.join(os.path.dirname(path), face)).convert("RGB"))
            out[name] = Image.fromarray(np.dstack([refaced(rgba, rgb, redraw, part["face_zone"]),
                                                   alpha]).astype(np.uint8), "RGBA")
    return out


def refaced(rgba, rgb, redraw, zone):
    """The part's pixels with what the redraw changed inside the zone ellipse, blended in with a
    soft edge. The redraw must sit on the same canvas; a shifted one is reported."""
    x, y, rx, ry = zone
    inside = np.zeros(rgb.shape[:2], np.uint8)
    cv2.ellipse(inside, (x, y), (rx, ry), 0, 0, 360, 255, -1)
    diff = np.abs(rgb.astype(np.int16) - redraw.astype(np.int16)).max(axis=2)
    ring = (cv2.dilate(inside, disc(60)) > 0) & (inside == 0)
    drift = diff[ring].mean()
    if drift > 25:
        print(f"warning: a face redraw differs by {drift:.0f} around its zone; is it aligned?")
    changed = ((diff > 40) & (inside > 0)).astype(np.uint8)
    changed = cv2.dilate(cv2.morphologyEx(changed, cv2.MORPH_CLOSE, disc(12)), disc(8))
    w = cv2.GaussianBlur(changed.astype(np.float32), (0, 0), 3)[..., None] * (inside[..., None] > 0)
    return (rgba * (1 - w) + redraw * w).round()


def prop(path, part, clean=False):
    """A separately drawn sticker as a part: background removed, scaled, grip on the pivot."""
    src = Image.open(path).convert("RGB")
    fg = np.array(ImageChops.invert(background_mask(src)))
    if clean:
        rgb, a = clean_silhouette(np.array(src), fg)
        im = Image.fromarray(np.dstack([rgb, np.minimum(fg, a)]).astype(np.uint8), "RGBA")
    else:
        im = src.convert("RGBA")
        im.putalpha(Image.fromarray(fg))
    box = im.getbbox()
    im = im.crop(box)
    k = part["scale"]
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    gx, gy = (part["grip"][0] - box[0]) * k, (part["grip"][1] - box[1]) * k
    return im, round(part["pivot"][0] - gx), round(part["pivot"][1] - gy)


def repaint(spec, part, im):
    """The part in the paint the spec's "recolor" gives it (tools/recolor_armour.py), if any."""
    to = paint_for(spec, part["name"])
    return recolor(im, to) if to else im


def save_part(out_dir, part, pivot, im, x0, y0, meta, layers):
    im.save(os.path.join(out_dir, part["name"] + ".png"), optimize=True)
    px, py = pivot
    meta.append({
        "name": part["name"],
        "w": im.width, "h": im.height,
        "x": x0, "y": y0,                   # top-left in source pixels
        "anchorX": round((px - x0) / im.width, 4),
        "anchorY": round((py - y0) / im.height, 4),
        "pivot": [px, py],
    })
    layers.append((im, x0, y0, px, py))


def preview(size, layers):
    w, h = size
    m = 120  # margin so the exploded view never lands at a negative offset
    board = Image.new("RGBA", (w * 3, h + 2 * m), (255, 255, 255, 255))
    d = ImageDraw.Draw(board)
    d.rectangle([w * 2, 0, w * 3, h + 2 * m], fill=(40, 52, 64, 255))
    for y in range(0, h + 2 * m, 32):
        for x in range(0, w * 2, 32):
            if (x // 32 + y // 32) % 2:
                d.rectangle([x, y, x + 31, y + 31], fill=(210, 210, 210, 255))
    # left: rest pose; middle: exploded view so seams and fills are visible; right: the rest
    # pose on a dark ground, where a light fringe would show
    cx = sum(l[3] for l in layers) / len(layers)
    cy = sum(l[4] for l in layers) / len(layers)
    for im, x0, y0, px, py in layers:
        board.alpha_composite(im, (x0, y0 + m))
        ex, ey = (px - cx) * 0.35, (py - cy) * 0.35
        board.alpha_composite(im, (int(x0 + w + ex), int(y0 + m + ey)))
        board.alpha_composite(im, (x0 + 2 * w, y0 + m))
    for _, _, _, px, py in layers:
        d.ellipse([px - 5, py + m - 5, px + 5, py + m + 5], outline=(255, 0, 0, 255), width=2)
    return board


if __name__ == "__main__":
    split(sys.argv[1], sys.argv[2])
