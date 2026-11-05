"""The sticker pass (sticker_pass.py) on cut-out pieces before a packer takes them (corgi_art.py):
each piece is trimmed, scaled so its longest side is the packer's, then given the outline it
will show at the size the game draws it (flat=True also flattens its colours, which grains
painted props and icons, so they keep their paint).
usage: python sticker_art.py <longest px> <drawn units> <png>...   (rewritten in place)"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from cutout import cutout  # noqa: E402
from sticker_pass import OUTLINE, OUT_SHARE, sticker  # noqa: E402


SPECK = 2.5  # world units: loose crumbs smaller than this square would outline into black dots


def drop_specks(rgba, area):
    """Clears the detached bits of a picture smaller than <area> px."""
    n, lab, stats, _ = cv2.connectedComponentsWithStats((rgba[:, :, 3] >= 64).astype(np.uint8), connectivity=8)
    small = np.zeros(n, bool)
    small[1:] = stats[1:, cv2.CC_STAT_AREA] < area
    near = cv2.dilate(small[lab].astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    keep = ~small[lab] & cv2.dilate((~small[lab] & (lab > 0)).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    out = rgba.copy()
    out[near & ~keep] = 0
    return out


def sticker_piece(path, longest, units, holes=(), flat=False):
    """Rewrites the piece at <path> at <longest> px on its long side, outline included, as the
    game shows it <units> world units long. The packers trim and rescale again by 1."""
    im = cutout(path, holes)
    scale = longest / units
    pad = int(np.ceil(OUTLINE * OUT_SHARE * scale)) + 1
    k = (longest - 2 * pad) / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    page = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad))
    page.alpha_composite(im, (pad, pad))
    page = drop_specks(np.array(page), (SPECK * scale) ** 2)
    out = Image.fromarray(sticker([page], scale, flat=flat)[0])
    out.crop(out.getchannel("A").getbbox()).save(path)


def main():
    longest, units = int(sys.argv[1]), float(sys.argv[2])
    for p in sys.argv[3:]:
        sticker_piece(p, longest, units)


if __name__ == "__main__":
    main()
