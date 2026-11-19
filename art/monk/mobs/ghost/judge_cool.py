"""Turns the redrawn judge's brown brush handle (and the book's cream page edges, left as they
are) into the old drawing's dark slate: inside the handle's box, every brown pixel keeps its
lightness and takes a cold slate hue.
usage: python judge_cool.py judge3L.png judge3_v1.png"""
import sys

import cv2
import numpy as np

src, dst = sys.argv[1:3]
bgr = cv2.imread(src)
hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.int32)
win = np.zeros(hsv.shape[:2], bool)
win[420:850, 280:430] = True  # the handle below the ferrule, in judge3L.png's pixels
hit = win & (hsv[..., 0] >= 2) & (hsv[..., 0] <= 36) & (hsv[..., 1] > 35) & (hsv[..., 2] > 25)
hit = cv2.dilate(hit.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
hit &= win & (hsv[..., 0] <= 40) & (hsv[..., 1] > 20)
hsv[hit, 0] = 108
hsv[hit, 1] = 40
hsv[hit, 2] = np.clip(hsv[hit, 2] * 0.85, 0, 255)
cv2.imwrite(dst, cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR))
print(f"{int(hit.sum())} px cooled")
