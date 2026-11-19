"""Cleans cut rig parts in place: fills the holes inside a part, repaints stray blobs and takes
the light fringe off its soft edge.
usage: python clean_parts.py <parts dir> [--blob part:x,y ...] [--max-hole 400] [--dry]

A hole is a see-through patch (alpha < 128) that does not reach the part's border, or reaches it
only through a slit up to 2 * --gap px wide. Under the runtime sticker outline
(TaoActor.outline) it shows the ink or the ground through the body. Notches under --min-hole px
are the soft edge's own and stay; holes up to --max-hole px take the colour of the nearest solid
pixel; bigger ones are named and left alone, since they may be meant (a ring, a gap under an arm).

A blob is a leftover in a wrong colour, e.g. a white tooth tip or a red eye glow the cut dragged
into a neighbouring part. --blob seeds it at a point in the part's own pixels; every pixel
connected to it whose colour stays within 60 of the seed's, and its soft rim (the pixels round it
whose colour is a blend of the seed's and the body's or the outline's ink round it), takes the
body's colour (or the ink), keeping its alpha.

The fringe is the cut's light background left in the soft edge's colour: a half-clear edge pixel
much lighter than the nearest solid one. Over the sticker outline it drew a pale line between the
part's own ink and the outline; it takes the nearest solid pixel's colour, keeping its alpha."""
import argparse
import os
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ap = argparse.ArgumentParser()
ap.add_argument("dir")
ap.add_argument("--blob", action="append", default=[], help="part:x,y")
ap.add_argument("--min-hole", type=int, default=6)
ap.add_argument("--max-hole", type=int, default=400)
ap.add_argument("--gap", type=int, default=1, help="half the widest slit a hole may leak out by")
ap.add_argument("--dry", action="store_true", help="report only")
a = ap.parse_args()


def from_nearest(px, mask, source):
    """Repaints the `mask` pixels of RGBA `px` from the nearest `source` pixel (colour and alpha)."""
    _, (iy, ix) = nd.distance_transform_edt(~source, return_indices=True)
    ys, xs = np.nonzero(mask)
    px[ys, xs] = px[iy[ys, xs], ix[ys, xs]]


blobs = {}
for b in a.blob:
    name, at = b.split(":")
    blobs.setdefault(name, []).append(tuple(int(v) for v in at.split(",")))

for f in sorted(os.listdir(a.dir)):
    name, ext = os.path.splitext(f)
    if ext != ".png" or name == "preview":
        continue
    path = os.path.join(a.dir, f)
    px = np.asarray(Image.open(path).convert("RGBA")).copy()
    notes = []
    for x, y in blobs.get(name, []):
        seed = px[y, x, :3].astype(int)
        near = (np.abs(px[..., :3].astype(int) - seed).max(-1) <= 60) & (px[..., 3] > 0)
        lab, _ = nd.label(near)
        blob = lab == lab[y, x]
        solid = px[..., 3] > 0
        ring = nd.binary_dilation(blob, iterations=5) & ~nd.binary_dilation(blob, iterations=2) & solid
        col = px[ring][:, :3].astype(int)
        body = np.median(col, axis=0)
        # the outline's ink: the darkest fifth round it
        lum = col.sum(-1)
        ink = np.median(col[lum <= np.percentile(lum, 20)], axis=0)
        px[blob, :3] = body
        # its soft rim: the pixels round it blended from the seed's colour and the body's or the
        # ink's, which take that other colour
        rim = nd.binary_dilation(blob, iterations=3) & solid & ~blob
        for end in (ink, body):
            way = seed - end
            off = px[..., :3].astype(float) - end
            t = (off @ way) / max(1.0, float(way @ way))
            miss = np.linalg.norm(off - t[..., None] * way, axis=-1)
            on = rim & (t > 0.05) & (miss < 20)
            px[on, :3] = end
            blob |= on
        notes.append(f"blob at {x},{y}: {int(blob.sum())} px")
    clear = px[..., 3] < 128
    # the outside, found with slits up to 2 * gap px shut, then grown back over them
    shut = nd.binary_erosion(clear, iterations=a.gap, border_value=1)
    sl, sn = nd.label(shut)
    ends = set(np.unique(np.concatenate([sl[0], sl[-1], sl[:, 0], sl[:, -1]]))) - {0}
    outside = nd.binary_dilation(np.isin(sl, list(ends)), iterations=a.gap + 1) & clear
    lab, n = nd.label(clear & ~outside)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    fill = np.zeros_like(clear)
    for i in range(1, n + 1):
        if i in edge:
            continue
        hole = lab == i
        size = int(hole.sum())
        if size < a.min_hole:
            continue
        if size > a.max_hole:
            notes.append(f"kept a {size} px hole")
            continue
        fill |= hole
        notes.append(f"filled a {size} px hole")
    if fill.any():
        # a filled hole is solid through, its soft rim too (repainted, since a faint pixel's colour
        # is the cut's guess), so no ring of ground or speck of white shows round it
        rim = nd.binary_dilation(fill, iterations=2) & (px[..., 3] > 0) & (px[..., 3] < 255)
        from_nearest(px, fill | (rim & clear), ~clear)
        px[fill | rim, 3] = 255
    soft = (px[..., 3] > 0) & (px[..., 3] < 255)
    _, (iy, ix) = nd.distance_transform_edt(px[..., 3] < 255, return_indices=True)
    near = px[iy, ix, :3]
    fringe = soft & (px[..., :3].astype(int).sum(-1) - near.astype(int).sum(-1) > 90)
    if fringe.any():
        px[fringe, :3] = near[fringe]
        notes.append(f"fringe {int(fringe.sum())} px")
    if notes:
        print(name, "; ".join(notes))
        if not a.dry:
            Image.fromarray(px).save(path, optimize=True)
