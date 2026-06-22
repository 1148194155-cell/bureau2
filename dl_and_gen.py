import os, sys, time, torch
from huggingface_hub import snapshot_download
from diffusers import StableDiffusionPipeline

MODEL_DIR = r"D:\localcanvas2\sd15_model"
OUT_DIR = r"D:\localcanvas2\output"
os.makedirs(OUT_DIR, exist_ok=True)

# Download missing files directly to MODEL_DIR
print("Syncing model files (only missing ones)...")
snapshot_download("runwayml/stable-diffusion-v1-5", local_dir=MODEL_DIR, ignore_patterns=["*.ckpt", "*.bin", "*.fp16*"])
print("All files ready.")

# Verify
for sub in ["unet", "vae"]:
    f = os.path.join(MODEL_DIR, sub, "diffusion_pytorch_model.safetensors")
    sz = os.path.getsize(f) if os.path.exists(f) else 0
    print(f"  {sub}: {sz//1048576} MB")

print("Loading pipeline...")
pipe = StableDiffusionPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
pipe.to("cpu")

POS = "masterpiece, best quality, anime style, Dragon Ball, Broly Super Saiyan 4, muscular male warrior, green fur covering body, wild black hair standing up, green ki aura blazing, intense glowing eyes, battle damaged arena, dynamic pose, dramatic lighting, heavy shadows"
NEG = "low quality, blurry, ugly, deformed, bad anatomy, watermark, text, extra limbs, missing fingers"

print("Generating (20 steps, 512x512, CPU)...")
t0 = time.time()
img = pipe(POS, negative_prompt=NEG, num_inference_steps=20, width=512, height=512).images[0]
print(f"Generated in {time.time()-t0:.1f}s")

p = os.path.join(OUT_DIR, "broly_ss4.png")
img.save(p)
print(f"Saved: {p} ({os.path.getsize(p)//1024} KB)")
