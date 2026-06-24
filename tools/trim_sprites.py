"""
trim_sprites.py — 批量去除精灵图四周多余白边
用法：
  python tools/trim_sprites.py
  
会处理 src/assets/shenjiu/ 下的 walk01-04.png，
去除白色背景和多余空白，统一画布尺寸，人物居中，原地覆盖保存。

依赖：pip install Pillow
"""

from PIL import Image
import os
import glob

# ─── 配置区 ──────────────────────────────────────────────
INPUT_GLOB   = "src/assets/animal_ears/**/*.png"  # 要处理的文件（glob 模式）
PADDING      = 12                               # 裁剪后四周保留的透明边距（像素）
BG_THRESHOLD = 240                              # 亮度阈值，超过此值视为白色背景
# ─────────────────────────────────────────────────────────


def remove_white_bg(img: Image.Image, threshold: int) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (r, g, b, 0)
    return img


def trim_and_normalize(paths: list[str], padding: int, threshold: int):
    imgs = []
    bboxes = []

    print(f"正在读取 {len(paths)} 张图片并分析内容边界...")

    for path in paths:
        img = Image.open(path).convert("RGBA")
        # img = remove_white_bg(img, threshold)  # DONT REMOVE WHITE PIXELS!
        bbox = img.getbbox()
        imgs.append(img)
        bboxes.append(bbox)
        print(f"  {os.path.basename(path)}: 原始尺寸 {img.size}, 内容区域 {bbox}")

    valid_bboxes = [b for b in bboxes if b]
    if not valid_bboxes:
        print("错误：所有图片均为空白，请检查输入文件。")
        return

    # 统一画布 = 所有帧内容区域的最大宽高 + padding
    max_w = max(b[2] - b[0] for b in valid_bboxes)
    max_h = max(b[3] - b[1] for b in valid_bboxes)
    canvas_w = max_w + padding * 2
    canvas_h = max_h + padding * 2
    print(f"\n统一画布尺寸: {canvas_w} x {canvas_h}（内容区 {max_w}x{max_h} + {padding}px 边距）")

    for img, bbox, path in zip(imgs, bboxes, paths):
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        if bbox:
            content = img.crop(bbox)
            cw, ch = content.size
            # 水平居中，垂直底对齐（让脚踩在同一基准线上，头部自然往上）
            paste_x = (canvas_w - cw) // 2
            paste_y = canvas_h - ch - padding  # 底部对齐，保留 padding
            canvas.paste(content, (paste_x, paste_y), content)
        canvas.save(path, "PNG")
        print(f"  已保存: {path}")

    print(f"\n完成！{len(paths)} 张图片已更新。")


if __name__ == "__main__":
    paths = sorted(glob.glob(INPUT_GLOB, recursive=True))
    if not paths:
        print(f"未找到匹配文件：{INPUT_GLOB}")
    else:
        trim_and_normalize(paths, PADDING, BG_THRESHOLD)
