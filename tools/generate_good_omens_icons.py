import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFilter


def find_hug_asset():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.normpath(os.path.join(script_dir, "..", "src", "assets"))
    skin_dir = os.path.join(assets_dir, "default")

    png_path = os.path.join(skin_dir, "hug.png")
    webp_path = os.path.join(skin_dir, "hug.webp")

    if os.path.exists(png_path):
        return png_path
    if os.path.exists(webp_path):
        return webp_path

    cwd_png = os.path.join("src", "assets", "default", "hug.png")
    cwd_webp = os.path.join("src", "assets", "default", "hug.webp")
    if os.path.exists(cwd_png):
        return cwd_png
    if os.path.exists(cwd_webp):
        return cwd_webp

    raise FileNotFoundError("Could not find hug.png or hug.webp in src/assets/default/")


def create_good_omens_icon(size=512, hug_path=None):
    if hug_path is None:
        hug_path = find_hug_asset()

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    center_x, center_y = size / 2.0, size / 2.0
    radius = size * 0.46
    diameter = int(radius * 2)

    # 1. Outer soft drop shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    shadow_offset = size * 0.015
    s_draw.ellipse(
        [
            center_x - radius,
            center_y - radius + shadow_offset,
            center_x + radius,
            center_y + radius + shadow_offset,
        ],
        fill=(0, 0, 0, 65),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.02)))
    img.paste(shadow, (0, 0), shadow)

    # 2. Polished circular disk with warm celestial ivory/cream to antique cream-gold gradient
    grad_line = Image.new("RGB", (1, diameter))
    for y in range(diameter):
        t = y / float(max(1, diameter - 1))
        # Top: celestial ivory/cream (254, 252, 246)
        # Bottom: warm antique cream-gold (242, 228, 204)
        r = int(254 * (1 - t) + 242 * t)
        g = int(252 * (1 - t) + 228 * t)
        b = int(247 * (1 - t) + 204 * t)
        grad_line.putpixel((0, y), (r, g, b))

    grad_rect = grad_line.resize((diameter, diameter), Image.Resampling.BICUBIC)

    # Antialiased circular mask
    mask_hires = Image.new("L", (diameter * 2, diameter * 2), 0)
    m_draw = ImageDraw.Draw(mask_hires)
    m_draw.ellipse([0, 0, diameter * 2 - 1, diameter * 2 - 1], fill=255)
    mask = mask_hires.resize((diameter, diameter), Image.Resampling.LANCZOS)

    disc_origin = (int(center_x - radius), int(center_y - radius))
    img.paste(grad_rect, disc_origin, mask)

    # 3. Fine double gold border (outer dark antique gold, inner subtle warm highlight)
    rim_hires = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
    r_draw = ImageDraw.Draw(rim_hires)
    cx2, cy2 = size, size
    r2 = radius * 2
    outer_w = max(2, int(round(size * 0.026)))
    inner_w = max(1, int(round(size * 0.010)))
    inner_gap = size * 0.016

    # Outer dark antique gold
    r_draw.ellipse(
        [cx2 - r2, cy2 - r2, cx2 + r2, cy2 + r2],
        outline=(178, 138, 48, 245),
        width=outer_w,
    )
    # Inner accent ring
    r_draw.ellipse(
        [
            cx2 - (r2 - inner_gap),
            cy2 - (r2 - inner_gap),
            cx2 + (r2 - inner_gap),
            cy2 + (r2 - inner_gap),
        ],
        outline=(228, 192, 102, 180),
        width=inner_w,
    )
    rim = rim_hires.resize((size, size), Image.Resampling.LANCZOS)
    img.paste(rim, (0, 0), rim)

    # 4. Central artwork: trimmed and scaled hug sprite (~88-90% canvas height)
    hug_img = Image.open(hug_path).convert("RGBA")
    bbox = hug_img.getbbox()
    trimmed = hug_img.crop(bbox) if bbox else hug_img

    target_h = int(size * 0.88)
    target_w = int(round(trimmed.width * (target_h / float(trimmed.height))))
    scaled_hug = trimmed.resize((target_w, target_h), Image.Resampling.LANCZOS)

    char_x = int((size - target_w) / 2.0)
    char_y = int((size - target_h) / 2.0 + size * 0.005)

    # Subtle grounding shadow inside the badge
    ground_shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gs_draw = ImageDraw.Draw(ground_shadow)
    feet_w = target_w * 0.72
    feet_cx = char_x + target_w * 0.5
    feet_y = char_y + target_h - size * 0.01
    gs_draw.ellipse(
        [
            feet_cx - feet_w / 2.0,
            feet_y - size * 0.012,
            feet_cx + feet_w / 2.0,
            feet_y + size * 0.022,
        ],
        fill=(50, 38, 25, 75),
    )
    ground_shadow = ground_shadow.filter(
        ImageFilter.GaussianBlur(radius=int(size * 0.014))
    )
    img.paste(ground_shadow, (0, 0), ground_shadow)

    # Paste character
    img.paste(scaled_hug, (char_x, char_y), scaled_hug)

    return img


def create_template_icon(size=22):
    # Minimalist monochrome template icon for macOS menu bar
    scale = size / 22.0
    stroke_w = max(1, int(round(2 * scale)))
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Left C
    draw.arc(
        [1 * scale, 4 * scale, 10 * scale, 18 * scale],
        start=45,
        end=315,
        fill=(0, 0, 0, 255),
        width=stroke_w,
    )
    # Right A
    draw.line(
        [(12 * scale, 18 * scale), (16 * scale, 4 * scale)],
        fill=(0, 0, 0, 255),
        width=stroke_w,
    )
    draw.line(
        [(16 * scale, 4 * scale), (20 * scale, 18 * scale)],
        fill=(0, 0, 0, 255),
        width=stroke_w,
    )
    draw.line(
        [(14 * scale, 13 * scale), (18 * scale, 13 * scale)],
        fill=(0, 0, 0, 255),
        width=stroke_w,
    )
    return img


def main():
    assets_dir = os.path.join(os.path.dirname(__file__), "..", "src", "assets")

    master_512 = create_good_omens_icon(512)
    icon_256 = master_512.resize((256, 256), Image.Resampling.LANCZOS)

    # 1. icon.png (256x256 RGBA)
    png_path = os.path.join(assets_dir, "icon.png")
    icon_256.save(png_path, "PNG")
    print(f"[OK] Saved {png_path}")

    # 2. icon.ico (multi-size 16, 32, 48, 256)
    ico_path = os.path.join(assets_dir, "icon.ico")
    icon_256.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (256, 256)],
    )
    print(f"[OK] Saved {ico_path}")

    # 3. icon.icns via iconutil on macOS
    icns_path = os.path.join(assets_dir, "icon.icns")
    with tempfile.TemporaryDirectory() as tmpdir:
        iconset_dir = os.path.join(tmpdir, "icon.iconset")
        os.makedirs(iconset_dir, exist_ok=True)

        sizes = [
            ("icon_16x16.png", 16),
            ("icon_16x16@2x.png", 32),
            ("icon_32x32.png", 32),
            ("icon_32x32@2x.png", 64),
            ("icon_128x128.png", 128),
            ("icon_128x128@2x.png", 256),
            ("icon_256x256.png", 256),
            ("icon_256x256@2x.png", 512),
            ("icon_512x512.png", 512),
        ]
        for name, sz in sizes:
            resized = master_512.resize((sz, sz), Image.Resampling.LANCZOS)
            resized.save(os.path.join(iconset_dir, name))

        cmd = ["/usr/bin/iconutil", "-c", "icns", iconset_dir, "-o", icns_path]
        subprocess.run(cmd, check=True)
        print(f"[OK] Compiled {icns_path}")

    # 4. iconTemplate.png (22x22) & iconTemplate@2x.png (44x44)
    tmpl_path = os.path.join(assets_dir, "iconTemplate.png")
    tmpl2x_path = os.path.join(assets_dir, "iconTemplate@2x.png")

    tmpl_22 = create_template_icon(22)
    tmpl_44 = create_template_icon(44)
    tmpl_22.save(tmpl_path, "PNG")
    tmpl_44.save(tmpl2x_path, "PNG")
    print(f"[OK] Saved {tmpl_path} and {tmpl2x_path}")


if __name__ == "__main__":
    main()
