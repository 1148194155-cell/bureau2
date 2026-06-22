"""
Local Canvas — 文生图节点 (带 fallback)
优先使用 SSD-1B（本地缓存命中时），否则用 Pillow 生成测试图
"""
import time, os, sys, json, hashlib, textwrap

OUTPUT_DIR = r"D:\localcanvas2\output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

_MODEL_READY = None
_pipe_cache = None

def _is_model_cached():
    """仅检查模型是否已完整下载到本地缓存，不触发网络下载"""
    cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
    model_dir = os.path.join(cache_dir, "models--segmind--SSD-1B")
    if not os.path.isdir(model_dir):
        return False
    snapshots = os.path.join(model_dir, "snapshots")
    if not os.path.isdir(snapshots):
        return False
    for entry in os.listdir(snapshots):
        sub = os.path.join(snapshots, entry)
        if not os.path.isdir(sub):
            continue
        # 必须包含 model_index.json（完整快照标志）
        if not os.path.isfile(os.path.join(sub, "model_index.json")):
            continue
        # 检查 unet 中是否有实际的模型权重文件 (>1MB)
        unet = os.path.join(sub, "unet")
        if os.path.isdir(unet):
            for f in os.listdir(unet):
                fp = os.path.join(unet, f)
                if os.path.isfile(fp) and os.path.getsize(fp) > 1024 * 1024:
                    return True
    return False


def try_load_model():
    global _MODEL_READY, _pipe_cache
    if _MODEL_READY is not None:
        return _MODEL_READY
    if _pipe_cache is not None:
        _MODEL_READY = True
        return True

    if not _is_model_cached():
        print("[INFO] SSD-1B 未缓存，跳过下载 (离线模式)")
        _MODEL_READY = False
        return False

    try:
        print("[INFO] Loading SSD-1B from cache...")
        t0 = time.time()
        import torch
        from diffusers import DiffusionPipeline
        pipe = DiffusionPipeline.from_pretrained(
            "segmind/SSD-1B",
            torch_dtype=torch.float32,
            safety_checker=None,
            local_files_only=True,
        )
        pipe.to("cpu")
        pipe.enable_attention_slicing()
        _pipe_cache = pipe
        _MODEL_READY = True
        print(f"[INFO] Model loaded in {time.time()-t0:.1f}s")
        return True
    except Exception as e:
        print(f"[WARN] SSD-1B 加载失败: {str(e)[:120]}")
        _MODEL_READY = False
        return False


def generate_with_model(prompt, neg, width, height, steps, guidance):
    import torch
    pipe = _pipe_cache
    print(f"[GEN] {prompt[:60]}... ({width}x{height})")
    t0 = time.time()
    image = pipe(
        prompt=prompt,
        negative_prompt=neg or "low quality, blurry, distorted",
        num_inference_steps=steps,
        guidance_scale=guidance,
        width=width,
        height=height,
    ).images[0]
    print(f"[GEN] Done in {time.time()-t0:.1f}s")
    return image


def generate_fallback(prompt, width, height):
    from PIL import Image, ImageDraw, ImageFont

    print(f"[FALLBACK] {width}x{height} for: {prompt[:50]}...")

    h = hashlib.md5(prompt.encode()).hexdigest()
    r1, g1, b1 = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    r2, g2, b2 = int(h[6:8], 16), int(h[8:10], 16), int(h[10:12], 16)

    img = Image.new('RGB', (width, height))
    for y in range(height):
        t = y / height
        r, g, b = int(r1 + (r2 - r1) * t), int(g1 + (g2 - g1) * t), int(b1 + (b2 - b1) * t)
        for x in range(width):
            img.putpixel((x, y), (r, g, b))

    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 28)
    except Exception:
        font = ImageFont.load_default()

    wrapped = textwrap.wrap(prompt, width=40)
    y_text = height // 3
    for line in wrapped[:6]:
        bbox = draw.textbbox((0, 0), line, font=font)
        draw.text(((width - bbox[2] + bbox[0]) // 2, y_text), line, fill=(255, 255, 255), font=font)
        y_text += 36

    tag = "[Local Canvas AI]"
    bbox = draw.textbbox((0, 0), tag, font=font)
    draw.text(((width - bbox[2] + bbox[0]) // 2, height - 50), tag, fill=(255, 255, 200), font=font)
    print("[FALLBACK] Done (<0.1s)")
    return img


def generate(prompt, negative_prompt="", width=768, height=768, steps=4, guidance=7.5):
    if try_load_model():
        return generate_with_model(prompt, negative_prompt, width, height, steps, guidance)
    return generate_fallback(prompt, width, height)


if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "high quality anime dragon ball"
    neg = sys.argv[2] if len(sys.argv) > 2 else ""
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 768
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 768
    s = int(sys.argv[5]) if len(sys.argv) > 5 else 4

    img = generate(prompt, neg, w, h, s)
    ts = int(time.time())
    out = os.path.join(OUTPUT_DIR, f"gen_{ts}.png")
    img.save(out)
    sz = os.path.getsize(out)
    print(f"[SAVE] {out} ({sz//1024} KB)")

    result = {"filePath": out, "size": sz, "format": "png", "prompt": prompt}
    print(f"\n[RESULT] {json.dumps(result)}")
