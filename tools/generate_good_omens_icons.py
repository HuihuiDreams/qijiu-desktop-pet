import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFilter

def create_good_omens_icon(size=512):
    # High resolution master (size x size)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center_x, center_y = size / 2, size / 2
    radius = size * 0.44

    # 1. Subtle squircle / rounded circular base with midnight blue-black gradient
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base_draw = ImageDraw.Draw(base)
    
    # Draw soft outer shadow
    for i in range(12):
        r = radius + (12 - i) * 1.5
        alpha = int(8 + i * 4)
        base_draw.ellipse(
            [center_x - r, center_y - r + 8, center_x + r, center_y + r + 8],
            fill=(0, 0, 0, alpha)
        )
    base = base.filter(ImageFilter.GaussianBlur(radius=4))
    img.paste(base, (0, 0), base)

    # Main disk: split into Crowley (left dark-red/night) & Aziraphale (right ivory/celestial gold)
    disk = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    disk_draw = ImageDraw.Draw(disk)
    
    # Background gradient disk
    for y in range(int(center_y - radius), int(center_y + radius) + 1):
        for x in range(int(center_x - radius), int(center_x + radius) + 1):
            dx = x - center_x
            dy = y - center_y
            dist = (dx*dx + dy*dy) ** 0.5
            if dist <= radius:
                # Left side: deep burgundy/charcoal (Crowley); Right side: deep royal celestial navy (Aziraphale)
                t_x = (dx / radius + 1) / 2  # 0.0 to 1.0
                r_col = int(32 * (1 - t_x) + 18 * t_x)
                g_col = int(14 * (1 - t_x) + 24 * t_x)
                b_col = int(22 * (1 - t_x) + 48 * t_x)
                disk.putpixel((x, y), (r_col, g_col, b_col, 255))
                
    img.paste(disk, (0, 0), disk)

    # 2. Celestial Golden Halo Ring (top center, angled)
    halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo)
    halo_cx = center_x
    halo_cy = center_y * 0.52
    halo_rx = size * 0.26
    halo_ry = size * 0.10

    # Halo glow
    for stroke in range(8, 1, -1):
        halo_draw.ellipse(
            [halo_cx - halo_rx - stroke, halo_cy - halo_ry - stroke,
             halo_cx + halo_rx + stroke, halo_cy + halo_ry + stroke],
            outline=(245, 205, 95, 30 + (8 - stroke) * 20),
            width=stroke
        )
    halo_draw.ellipse(
        [halo_cx - halo_rx, halo_cy - halo_ry, halo_cx + halo_rx, halo_cy + halo_ry],
        outline=(255, 230, 140, 240),
        width=int(size * 0.022)
    )
    img.paste(halo, (0, 0), halo)

    # 3. Aziraphale's Angel Wing (Right side)
    wing = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    wing_draw = ImageDraw.Draw(wing)
    
    # Ivory & silver feathery arcs
    feathers = [
        # (center_offset_x, center_offset_y, rx, ry, angle, alpha)
        (center_x + size * 0.14, center_y + size * 0.02, size * 0.18, size * 0.28, -25, (250, 248, 240, 230)),
        (center_x + size * 0.19, center_y + size * 0.08, size * 0.15, size * 0.24, -18, (240, 238, 225, 220)),
        (center_x + size * 0.22, center_y + size * 0.15, size * 0.12, size * 0.20, -10, (235, 230, 215, 210)),
    ]
    for fx, fy, frx, fry, rot, color in feathers:
        f_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        f_draw = ImageDraw.Draw(f_layer)
        f_draw.ellipse([fx - frx, fy - fry, fx + frx, fy + fry], fill=color)
        f_draw.ellipse([fx - frx + 4, fy - fry + 4, fx + frx - 4, fy + fry - 4], fill=(255, 255, 255, 120))
        f_layer = f_layer.rotate(rot, center=(fx, fy))
        wing.paste(f_layer, (0, 0), f_layer)

    img.paste(wing, (0, 0), wing)

    # 4. Crowley's Dark Sunglasses & Snake Eye Motif (Left side)
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fg_draw = ImageDraw.Draw(fg)

    # Sunglasses frame (sleek, angled)
    glass_cx = center_x - size * 0.14
    glass_cy = center_y + size * 0.04
    glass_w = size * 0.14
    glass_h = size * 0.09
    
    # Outer black rim
    fg_draw.rounded_rectangle(
        [glass_cx - glass_w, glass_cy - glass_h, glass_cx + glass_w, glass_cy + glass_h],
        radius=int(glass_h * 0.45),
        fill=(18, 18, 20, 250),
        outline=(50, 48, 54, 255),
        width=int(size * 0.015)
    )
    # Dark reflective lens
    fg_draw.rounded_rectangle(
        [glass_cx - glass_w + 4, glass_cy - glass_h + 4, glass_cx + glass_w - 4, glass_cy + glass_h - 4],
        radius=int(glass_h * 0.4),
        fill=(32, 28, 36, 240)
    )
    # Amber / Golden Snake slit in the lens reflection
    slit_w = size * 0.016
    slit_h = glass_h * 0.65
    fg_draw.ellipse(
        [glass_cx - slit_w, glass_cy - slit_h, glass_cx + slit_w, glass_cy + slit_h],
        fill=(255, 185, 35, 230)
    )
    fg_draw.line(
        [(glass_cx, glass_cy - slit_h * 0.9), (glass_cx, glass_cy + slit_h * 0.9)],
        fill=(10, 8, 12, 240),
        width=int(size * 0.008)
    )
    # Sleek sunglasses bridge
    fg_draw.line(
        [(glass_cx + glass_w - 2, glass_cy - glass_h * 0.2), (center_x - size * 0.01, glass_cy - glass_h * 0.2)],
        fill=(50, 48, 54, 255),
        width=int(size * 0.012)
    )

    # Lens glare slash
    fg_draw.line(
        [(glass_cx - glass_w * 0.5, glass_cy - glass_h * 0.6), (glass_cx - glass_w * 0.2, glass_cy + glass_h * 0.6)],
        fill=(255, 255, 255, 75),
        width=int(size * 0.015)
    )

    img.paste(fg, (0, 0), fg)

    # 5. Starlight Sparkles (Starmaker stars)
    stars = [
        (center_x - size * 0.26, center_y - size * 0.18, 12, (255, 235, 150, 240)),
        (center_x + size * 0.28, center_y - size * 0.22, 16, (255, 255, 255, 250)),
        (center_x + size * 0.22, center_y + size * 0.28, 10, (230, 220, 255, 200)),
        (center_x - size * 0.20, center_y + size * 0.24, 11, (255, 190, 100, 220)),
    ]
    star_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(star_layer)
    for sx, sy, sr, scolor in stars:
        s_draw.line([(sx - sr, sy), (sx + sr, sy)], fill=scolor, width=2)
        s_draw.line([(sx, sy - sr), (sx, sy + sr)], fill=scolor, width=2)
        s_draw.ellipse([sx - 2, sy - 2, sx + 2, sy + 2], fill=(255, 255, 255, 255))
    
    img.paste(star_layer, (0, 0), star_layer)

    # 6. Fine outer golden border
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border)
    b_draw.ellipse(
        [center_x - radius, center_y - radius, center_x + radius, center_y + radius],
        outline=(212, 175, 85, 200),
        width=int(size * 0.012)
    )
    img.paste(border, (0, 0), border)

    return img

def create_template_icon(size=22):
    # Minimalist monochrome template icon for macOS menu bar
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Simple clean "CA" text or emblem
    # Draw stylized C and A
    # Left C
    draw.arc([1, 4, 10, 18], start=45, end=315, fill=(0, 0, 0, 255), width=2)
    # Right A
    draw.line([(12, 18), (16, 4)], fill=(0, 0, 0, 255), width=2)
    draw.line([(16, 4), (20, 18)], fill=(0, 0, 0, 255), width=2)
    draw.line([(14, 13), (18, 13)], fill=(0, 0, 0, 255), width=2)
    return img

def main():
    assets_dir = os.path.join(os.path.dirname(__file__), "..", "src", "assets")
    
    master_512 = create_good_omens_icon(512)
    icon_256 = master_512.resize((256, 256), Image.Resampling.LANCZOS)
    
    # 1. icon.png
    png_path = os.path.join(assets_dir, "icon.png")
    icon_256.save(png_path, "PNG")
    print(f"[OK] Saved {png_path}")

    # 2. icon.ico
    ico_path = os.path.join(assets_dir, "icon.ico")
    icon_256.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
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
