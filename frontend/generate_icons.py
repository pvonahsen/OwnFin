"""
Icon generator for finance tracker PWA.
Run this script after placing favicon-512.png next to it,
OR run as-is to generate beige placeholder icons.

Usage:
  python generate_icons.py                    # placeholders
  python generate_icons.py favicon-512.png    # from real source
"""
import sys
import os

output_dir = os.path.join(os.path.dirname(__file__), "public")
sizes = [
    (16,  "favicon-16x16.png"),
    (32,  "favicon-32x32.png"),
    (180, "apple-touch-icon.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png"),
]

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow not installed. Run: pip install Pillow")
    sys.exit(1)

source_path = sys.argv[1] if len(sys.argv) > 1 else None

if source_path and os.path.exists(source_path):
    src = Image.open(source_path).convert("RGBA")
    print(f"Using source: {source_path}")
else:
    if source_path:
        print(f"WARNING: {source_path} not found — generating placeholder instead.")
    else:
        print("No source provided — generating beige placeholder icons.")

    # Create a 512x512 beige placeholder with "f." text
    src = Image.new("RGBA", (512, 512), (244, 239, 230, 255))
    draw = ImageDraw.Draw(src)
    # Draw a simple dark "f." centered
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 280)
    except Exception:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/times.ttf", 280)
        except Exception:
            font = ImageFont.load_default()
    text = "f."
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (512 - w) // 2 - bbox[0]
    y = (512 - h) // 2 - bbox[1]
    draw.text((x, y), text, fill=(44, 36, 28, 255), font=font)

for size, name in sizes:
    out_path = os.path.join(output_dir, name)
    img = src.resize((size, size), Image.LANCZOS)
    img.save(out_path, "PNG")
    print(f"  Saved {out_path} ({size}x{size})")

print("Done.")
