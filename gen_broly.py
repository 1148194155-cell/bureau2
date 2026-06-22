import logging, sys
logging.basicConfig(level=logging.INFO, stream=sys.stderr)

from modelscope import snapshot_download
import torch, os, time
from diffusers import StableDiffusionPipeline

MODEL_DIR = r"D:\localcanvas2\sd15_model"
OUT_DIR = r"D:\localcanvas2\output"
os.makedirs(OUT_DIR, exist_ok=True)

# Download from ModelScope (China CDN, no VPN needed)
if not os.path.exists(os.path.join(MODEL_DIR, "v1-5-pruned-emaonly.safetensors")):
    print("Downloading SD 1.5 from ModelScope (~3.4GB)...")
    cache = snapshot_download("AI-ModelScope/stable-diffusion-v1-5", cache_dir=r"D:\localcanvas2\ms_cache")
    import shutil
    for f in os.listdir(cache):
        src = os.path.join(cache, f)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(MODEL_DIR, f))
    print("Download complete.")
else:
    print("Model already downloaded.")

POSITIVE = "masterpiece, best quality, anime style, Dragon Ball, Broly Super Saiyan 4, muscular male warrior, green fur covering body, wild black hair standing up, green ki aura blazing, intense glowing eyes, battle damaged arena, dynamic pose, dramatic lighting, heavy shadows"
NEGATIVE = "low quality, blurry, ugly, deformed, bad anatomy, watermark, text, extra limbs, missing fingers"

print("Loading pipeline...")
pipe = StableDiffusionPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.float32, safety_checker=None)
pipe.to("cpu")
print("Generating (20 steps, 512x512, CPU)...")

t0 = time.time()
img = pipe(POSITIVE, negative_prompt=NEGATIVE, num_inference_steps=20, width=512, height=512).images[0]
print(f"Generated in {time.time()-t0:.1f}s")

path = os.path.join(OUT_DIR, "broly_ss4.png")
img.save(path)
print(f"Saved: {path} ({os.path.getsize(path)//1024} KB)")
