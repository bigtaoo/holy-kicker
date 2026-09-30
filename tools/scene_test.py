"""同屏可读性测试：主角 + 一群杂兵 + 精英，按游戏内尺寸摆在地面上。
usage: python scene_test.py <主角图> <杂兵图> <精英图> <输出图>"""
import random
import sys
from PIL import Image, ImageDraw


def cutout(src):
    """从四角泛洪抠掉白底，角色内部的白色保留。"""
    rgb = Image.open(src).convert("RGB")
    mark = (255, 0, 255)
    for xy in [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]:
        ImageDraw.floodfill(rgb, xy, mark, thresh=40)
    im = Image.open(src).convert("RGBA")
    mask = Image.new("L", rgb.size, 255)
    mp, rp = mask.load(), rgb.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            if rp[x, y] == mark:
                mp[x, y] = 0
    im.putalpha(mask)
    return im.crop(im.getbbox())


def fit(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


hero_src, mob_src, elite_src, dst = sys.argv[1:5]
hero, mob, elite = fit(cutout(hero_src), 100), fit(cutout(mob_src), 72), fit(cutout(elite_src), 110)

W, H = 720, 480
rng = random.Random(7)
for name, ground in [("grass", (58, 74, 60)), ("night", (40, 40, 52))]:
    scene = Image.new("RGBA", (W, H), ground + (255,))
    sprites = []
    # 杂兵围成一圈，从右侧涌来的更密
    for _ in range(26):
        x, y = rng.randint(20, W - 90), rng.randint(20, H - 90)
        if abs(x - W // 2) < 90 and abs(y - H // 2) < 90:
            continue
        sprites.append((y + mob.height, mob, x, y))
    sprites.append((150 + elite.height, elite, 520, 150))
    sprites.append((H // 2 - 50 + hero.height, hero, W // 2 - hero.width // 2, H // 2 - 50))
    for _, im, x, y in sorted(sprites, key=lambda s: s[0]):  # 按脚底 y 排序
        scene.alpha_composite(im, (x, y))
    scene.save(dst.replace(".png", f"_{name}.png"))
