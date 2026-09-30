# Holy Kicker（光头球王）

竖屏 Q 版割草肉鸽：搞笑武僧踢蹴鞠、用念珠木鱼禅杖，对抗僵尸狐妖。PixiJS，发布到 CrazyGames / Poki 和微信小游戏。

## 目录

- `art/` 美术产出与探索稿
  - `hero/` 早期弓箭手流程测试（已搁置）
  - `monk/style_r1..r3/` 武僧风格探索，第 3 轮为当前定稿方向
- `tools/` 美术辅助脚本
  - `generate_image.sh <out> <prompt文件>`：Mistral 文生图
  - `edit_image.sh <in> <out.png> <prompt文件>`：Mistral 以图改图
  - `scene_test.py` / `portrait_test.py`：同屏可读性测试（竖屏三视口：手机、桌面小窗、桌面全屏）
  - `scale_test.py`：多尺寸缩放测试

## 美术规范（已锁定）

- 粗描边贴纸风、平涂、单层硬阴影、无渐变
- 主角暖色（橙/金）大光头；杂兵冷色（青绿/紫/灰）+ 红眼；精英冰蓝鬼火
- 敌人身上不出现高饱和暖色
- 逻辑分辨率 1080×1920；主角 120、杂兵 80、精英 130，UI 字号 ≥ 48

## 凭证

出图脚本从 `~/.vibe/mistral_curl_key{A,B}.conf` 读取 key，`MISTRAL_KEY=A|B` 切换（默认 B）。key 本身不进仓库。
