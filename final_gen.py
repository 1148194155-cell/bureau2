import os, time, torch, sys
from urllib.request import urlretrieve
from diffusers import StableDiffusionPipeline

MODEL_DIR = r"D:\localcanvas2\sd15_model"
OUT_DIR = r"D:\localcanvas2\output"
os.makedirs(OUT_DIR, exist_ok=True)

dst = os.path.join(MODEL_DIR, "unet", "diffusion_pytorch_model.safetensors")
if os.path.exists(dst) and os.path.getsize(dst) > 3000000000:
    print(f"unet already OK ({os.path.getsize(dst)//1048576} MB)")
else:
    url = "https://hf-mirror.com/runwayml/stable-diffusion-v1-5/resolve/main/unet/diffusion_pytorch_model.safetensors"
    print(f"Downloading unet (3242 MB) from hf-mirror.com...")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    last = [-1]
    def hook(count, block, total):
        pct = min(99, int(count * block * 100 / total))
        if pct > last[0] + 9:
            print(f"  {pct}%", end=" ", flush=True)
            last[0] = pct
    urlretrieve(url, dst, hook)
    print("100%")
    print(f"  Done: {os.path.getsize(dst)//1048576} MB")

print("Loading SD 1.5...")
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
