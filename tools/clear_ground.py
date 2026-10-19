"""Paint a drawing's ground shadow white, so cutout.py removes it with the background.
usage: python clear_ground.py <in> <out.png> <below_y> [min_value max_saturation]

Generated sprites often stand on a pale grey-blue shadow that closes off the paper between
their legs; cutout.py only clears background touching the border, so those gaps stay. Below
`below_y` this whitens light, weakly saturated paint (OpenCV HSV: value >= min_value,
saturation <= max_saturation; defaults 135 and 110), which leaves the dark outlines and the
darker legs alone, and grows the hit by a pixel so the anti-aliased rim of the shadow goes too."""
import sys

import cv2
import numpy as np


def clear(src, dst, below, vmin=135, smax=110):
    bgr = cv2.imread(src)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.int32)
    hit = (hsv[..., 2] >= vmin) & (hsv[..., 1] <= smax)
    hit[:below] = False
    grown = cv2.dilate(hit.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    grown[:below] = False
    # the grown pixel only takes the shadow's soft fringe, never the black outline
    grown &= hsv[..., 2] >= vmin * 0.6
    bgr[grown] = 255
    cv2.imwrite(dst, bgr)
    print(f"{int(grown.sum())} px cleared")


if __name__ == "__main__":
    a = sys.argv[1:]
    clear(a[0], a[1], int(a[2]), *[int(v) for v in a[3:5]])
