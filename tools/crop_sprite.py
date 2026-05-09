"""
crop_sprite.py — 自动裁剪行走帧精灵表
用法：
  1. 把生成的4帧图片（白底PNG/JPG）放到 tools/ 目录，命名为 sprite_sheet.png
  2. 运行：python tools/crop_sprite.py
  3. 输出 4 张 PNG（透明背景，尺寸统一）到 src/assets/shenjiu/

依赖：pip install Pillow
"""

from PIL import Image
import os

# ─── 配置区 ──────────────────────────────────────────────
INPUT_FILE   = "tools/sprite_sheet.png"   # 输入：4帧拼在一起的图
OUTPUT_DIR   = "src/assets/shenjiu"       # 输出目录
OUTPUT_PREFIX = "walk"                    # 文件名前缀，输出为 walk01.png ~ walk04.png
FRAME_COUNT  = 4                          # 横向帧数
PADDING      = 8                          # 裁剪后四周保留的透明边距（像素）
BG_THRESHOLD = 240                        # 亮度阈值，超过此值视为白色背景（0-255）
# ─────────────────────────────────────────────────────────


def remove_white_bg(img: Image.Image, threshold: int = 240) -> Image.Image:
    """将接近白色的像素替换为透明。"""
    img = img.convert("RGBA")
    data = img.getdata()
    new_data = []
    for r, g, b, a in data:
        if r >= threshold and g >= threshold and b >= threshold:
            new_data.append((r, g, b, 0))   # 透明
        else:
            new_data.append((r, g, b, a))   # 保留
    img.putdata(new_data)
    return img


def get_bbox(img: Image.Image):
    """返回图片中非透明区域的边界框 (left, top, right, bottom)。"""
    bbox = img.getbbox()
    return bbox  # 若全透明则返回 None


def split_and_crop(input_path: str, output_dir: str, prefix: str,
                   frame_count: int, padding: int, bg_threshold: int):
    os.makedirs(output_dir, exist_ok=True)

    sheet = Image.open(input_path).convert("RGBA")
    sheet_w, sheet_h = sheet.size
    frame_w = sheet_w // frame_count

    print(f"输入图片尺寸: {sheet_w} x {sheet_h}")
    print(f"每帧宽度: {frame_w}px，帧高: {sheet_h}px")
    print(f"正在处理 {frame_count} 帧...")

    # 第一轮：切帧 → 去白底 → 获取各帧的内容边界框
    frames = []
    bboxes = []
    for i in range(frame_count):
        left   = i * frame_w
        right  = left + frame_w
        frame  = sheet.crop((left, 0, right, sheet_h))
        frame  = remove_white_bg(frame, bg_threshold)
        bbox   = get_bbox(frame)
        frames.append(frame)
        bboxes.append(bbox)
        print(f"  帧 {i+1}: 内容区域 = {bbox}")

    # 计算所有帧中内容的最大宽高（让画布统一）
    max_content_w = max(b[2] - b[0] for b in bboxes if b)
    max_content_h = max(b[3] - b[1] for b in bboxes if b)
    canvas_w = max_content_w + padding * 2
    canvas_h = max_content_h + padding * 2

    print(f"\n统一画布尺寸: {canvas_w} x {canvas_h}（内容区 {max_content_w}x{max_content_h} + {padding}px边距）")

    # 第二轮：把每帧内容居中粘贴到统一画布
    for i, (frame, bbox) in enumerate(zip(frames, bboxes)):
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

        if bbox:
            content = frame.crop(bbox)
            content_w, content_h = content.size
            paste_x = (canvas_w - content_w) // 2
            paste_y = (canvas_h - content_h) // 2
            canvas.paste(content, (paste_x, paste_y), content)

        filename = f"{prefix}{i+1:02d}.png"
        out_path = os.path.join(output_dir, filename)
        canvas.save(out_path, "PNG")
        print(f"  已保存: {out_path}")

    print(f"\n完成！共 {frame_count} 帧输出到 {output_dir}/")
    print(f"在 config.js 中使用路径格式：assets/shenjiu/{prefix}_01.png")


if __name__ == "__main__":
    if not os.path.exists(INPUT_FILE):
        print(f"错误：找不到输入文件 '{INPUT_FILE}'")
        print("请把图片放到 tools/ 目录并命名为 sprite_sheet.png")
    else:
        split_and_crop(
            input_path   = INPUT_FILE,
            output_dir   = OUTPUT_DIR,
            prefix       = OUTPUT_PREFIX,
            frame_count  = FRAME_COUNT,
            padding      = PADDING,
            bg_threshold = BG_THRESHOLD,
        )
