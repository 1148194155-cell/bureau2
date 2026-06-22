import os, subprocess
from PIL import Image

SRC = r"D:\localcanvas2\output\broly_ss4.png"
OUT = r"D:\localcanvas2\output\broly_ss4_10s.mp4"
FRAME_DIR = r"D:\localcanvas2\output\frames"
os.makedirs(FRAME_DIR, exist_ok=True)

img = Image.open(SRC).convert("RGBA")
W, H = img.size
FPS = 24
DURATION = 10
TOTAL = FPS * DURATION

print(f"Rendering {TOTAL} frames...")
for i in range(TOTAL):
    t = i / TOTAL
    scale = 1.0 + 0.15 * t
    sw, sh = int(W * scale), int(H * scale)
    resized = img.resize((sw, sh), Image.LANCZOS)
    x = (sw - W) // 2
    y = int((sh - H) * (0.3 + 0.1 * t))  # slight pan downward
    cropped = resized.crop((x, y, x + W, y + H))
    cropped.save(os.path.join(FRAME_DIR, f"f{i:04d}.png"))
    if i % 60 == 0:
        print(f"  {i}/{TOTAL}")

print("Encoding MP4...")
subprocess.run([
    "ffmpeg", "-y", "-framerate", str(FPS), "-i",
    os.path.join(FRAME_DIR, "f%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-preset", "ultrafast", OUT
], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

sz = os.path.getsize(OUT)
print(f"Video saved: {OUT} ({sz//1024} KB, {sz//1048576} MB)")
import shutil
shutil.rmtree(FRAME_DIR)
