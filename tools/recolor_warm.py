"""Pull saturated yellow/orange paint inside a box towards cold off-white, keeping lightness.
usage: python recolor_warm.py <in> <out.png> x0 y0 x1 y1 [hue_lo hue_hi]
Hue is OpenCV's 0-180 scale; the default 14-40 catches yellow teeth and glowing eye cores but
leaves red (0-10) alone, so red eyes stay red."""
import sys

import cv2
import numpy as np


def recolor(src, dst, box, lo=14, hi=40):
    bgr = cv2.imread(src)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.int32)
    x0, y0, x1, y1 = box
    win = np.zeros(hsv.shape[:2], bool)
    win[y0:y1, x0:x1] = True
    hit = win & (hsv[..., 0] >= lo) & (hsv[..., 0] <= hi) & (hsv[..., 1] > 60) & (hsv[..., 2] > 90)
    # soft edge: grow by a pixel so anti-aliased fringes go too
    hit = cv2.dilate(hit.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    hit &= win & (hsv[..., 0] >= lo - 6) & (hsv[..., 0] <= hi + 6)
    hsv[hit, 0] = 120  # a hint of lavender, matches the boss's skin
    hsv[hit, 1] = 18
    hsv[hit, 2] = np.clip(hsv[hit, 2] * 1.05, 0, 255)
    cv2.imwrite(dst, cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR))
    print(f"{int(hit.sum())} px recoloured")


if __name__ == "__main__":
    a = sys.argv[1:]
    recolor(a[0], a[1], [int(v) for v in a[2:6]], *[int(v) for v in a[6:8]])
