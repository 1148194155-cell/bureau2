import torch, os, time, sys
from diffusers import StableDiffusionPipeline

MODEL_DIR = r"D:\localcanvas2\sd15_model"
OUT = r"D:\localcanvas2\output"
os.makedirs(OUT, exist_ok=True)

POSITIVE = "masterpiece, best quality, anime style, Dragon Ball, Broly Super Saiyan 4, muscular male warrior, green fur covering body, wild black hair standing up, green ki aura blazing, intense glowing eyes, battle damaged arena, dynamic pose, dramatic lighting, heavy shadows"
NEGATIVE = "low quality, blurry, ugly, deformed, bad anatomy, watermark, text, extra limbs, missing fingers"

print("Loading SD 1.5 from local path...")
try:
    pipe = StableDiffusionPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.float32)
    pipe.to("cpu")
    print("Model loaded on CPU. Generating (20 steps, 512x512)...")
    
    t0 = time.time()
    img = pipe(POSITIVE, negative_prompt=NEGATIVE, num_inference_steps=20, width=512, height=512).images[0]
    print(f"Generated in {time.time()-t0:.1f}s")
    
    path = os.path.join(OUT, "broly_ss4.png")
    img.save(path)
    print(f"Saved: {path} ({os.path.getsize(path)//1024} KB)")
except Exception as e:
    print(f"Pipeline loading failed: {e}")
    # Try without safety checker
    pipe = StableDiffusionPipeline.from_pretrained(MODEL_DIR, torch_dtype=torch.float32)
    pipe.to("cpu")
    t0 = time.time()
    img = pipe(POSITIVE, negative_prompt=NEGATIVE, num_inference_steps=20, width=512, height=512).images[0]
    print(f"Generated in {time.time()-t0:.1f}s")
    path = os.path.join(OUT, "broly_ss4.png")
    img.save(path)
    print(f"Saved: {path} ({os.path.getsize(path)//1024} KB)")
