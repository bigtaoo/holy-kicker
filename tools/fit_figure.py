"""Scale and place a standing character drawing on a fixed canvas, so several heroes share one
rig scale (the same gun size and muzzle offsets, the same origin between the feet).
usage: python fit_figure.py <in.png> <out.png> <height px> <src x> <feet x> <feet y> [W H]

The figure's bounding box (everything that is not border-connected paper, see
cutout.background_mask; the ground shadow counts as paper) is scaled to <height px> tall and
placed so its bottom edge at <src x> (source pixels, between the feet) lands on (feet x, feet y)
of a white W x H canvas
(default 1024 x 768, the corgi's A-pose)."""
import os
import sys

from PIL import Image, ImageChops

sys.path.insert(0, os.path.dirname(__file__))
from cutout import background_mask  # noqa: E402


def main(src, out, height, sx, fx, fy, w=1024, h=768):
    im = Image.open(src).convert("RGB")
    x0, y0, x1, y1 = ImageChops.invert(background_mask(im)).getbbox()
    k = height / (y1 - y0)
    fig = im.crop((x0, y0, x1, y1)).resize((round((x1 - x0) * k), round((y1 - y0) * k)),
                                           Image.LANCZOS)
    page = Image.new("RGB", (w, h), (255, 255, 255))
    page.paste(fig, (round(fx - (sx - x0) * k), round(fy - fig.height)))
    page.save(out)
    print(f"scale {k:.3f}, figure {fig.size}, box {x0},{y0},{x1},{y1}")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[1], *map(int, a[2:]))
