"""Turn the violet glows of chapter 5's props (crystals, flames, eyes) cold blue: violet is
kept for enemy attacks. usage: python cool_glow.py name... (reads <name>.png, writes <name>_v2.png)"""
import sys

import cv2
import numpy as np

for name in sys.argv[1:]:
    hsv = cv2.cvtColor(cv2.imread(f'{name}.png'), cv2.COLOR_BGR2HSV).astype(np.int32)
    # OpenCV hue is 0-180: 125-165 is violet to magenta; dull stone stays as it is
    hit = (hsv[..., 0] >= 125) & (hsv[..., 0] <= 165) & (hsv[..., 1] > 90) & (hsv[..., 2] > 90)
    hsv[hit, 0] = 96
    hsv[hit, 1] = (hsv[hit, 1] * 0.8).astype(np.int32)
    cv2.imwrite(f'{name}_v2.png', cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR))
    print(name, int(hit.sum()), 'px')
