import os, time, torch, sys
from urllib.request import urlretrieve
from diffusers import StableDiffusionPipeline

MODEL_DIR = r"D:\localcanvas2\sd15_model"
OUT_DIR = r"D:\localcanvas2\output"
os.makedirs(OUT_DIR, exist_ok=True)

# Use hf-mirror.com direct HTTP (no Git LFS — works for large files)
BASE = "https://hf-mirror.com/runwayml/stable-diffusion-v1-5/resolve/main"

FILES = [
    ("unet", "diffusion_pytorch_model.safetensors", 3400000000),
    ("vae", "diffusion_pytorch_model.safetensors", 335000000),
]

for subdir, fname, expected in FILES:
    dst = os.path.join(MODEL_DIR, subdir, fname)
    if os.path.exists(dst) and os.path.getsize(dst) > expected * 0.9:
        print(f"{subdir}/{fname}: OK ({os.path.getsize(dst)//1048576} MB)")
        continue
    url = f"{BASE}/{subdir}/{fname}"
    print(f"Downloading {subdir}/{fname} ({expected//1048576} MB) from hf-mirror.com...")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    
    last_pct = [-1]
    def reporthook(count, block, total):
        pct = min(99, int(count * block * 100 / total))
        if pct > last_pct[0] + 4:
            print(f"  {pct}%", end=" ", flush=True)
            last_pct[0] = pct
    
    try:
        urlretrieve(url, dst, reporthook)
        print("100%")
        print(f"  Done: {os.path.getsize(dst)//1048576} MB")
    except Exception as e:
        print(f"\n  FAILED: {e}")
        sys.exit(1)

print("Loading pipeline...")
pipe = StableDiffusionPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
pipe.to("cpu")

POS = "masterpiece, best quality, anime style, Dragon Ball, Broly Super Saiyan 4, muscular male warrior, green fur covering body, wild black hair standing up, green ki aura blazing, intense glowing eyes, battle damaged arena, dynamic pose, dramatic lighting, heavy shadows"
NEG = "low quality, blurry, ugly, deformed, bad anatomy, watermark, text, extra limbs, missing fingers"

print("Generating (20 steps, 512x512, CPU)...")
t0 = time.time()
img = pipe(POS, negative_prompt=NEG, num_inference_steps=20, width=512, height=512).images[0]
elapsed = time.time() - t0
print(f"Generated in {elapsed:.1f}s")

p = os.path.join(OUT_DIR, "broly_ss4.png")
img.save(p)
print(f"Saved: {p} ({os.path.getsize(p)//1024} KB)")
