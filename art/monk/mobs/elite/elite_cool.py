"""Turns the browns of a redrawn elite (the general's belt, beads and shoes) into a cold slate:
below row <y0> (under the face, so the red eyes' orange glow and the teeth stay), every brown
pixel keeps its lightness and takes a cold slate hue.
usage: python elite_cool.py genL.png general_v1.png 460"""
import sys

import cv2
import numpy as np

src, dst, y0 = sys.argv[1], sys.argv[2], int(sys.argv[3])
bgr = cv2.imread(src)
hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.int32)
win = np.zeros(hsv.shape[:2], bool)
win[y0:] = True
hit = win & (hsv[..., 0] >= 2) & (hsv[..., 0] <= 36) & (hsv[..., 1] > 30) & (hsv[..., 2] > 25)
hit = cv2.dilate(hit.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
hit &= win & (hsv[..., 0] <= 40) & (hsv[..., 1] > 18)
hsv[hit, 0] = 110
hsv[hit, 1] = 45
hsv[hit, 2] = np.clip(hsv[hit, 2] * 0.85, 0, 255)
cv2.imwrite(dst, cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR))
print(f"{int(hit.sum())} px cooled")
