"""
Local Canvas — 文生视频节点 (带 fallback)
优先使用 SSD-1B（缓存命中时），否则用 Pillow+ffmpeg 生成测试视频
"""
import time, os, sys, json, hashlib, textwrap, subprocess, shutil

OUTPUT_DIR = r"D:\localcanvas2\output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

_MODEL_READY = None
_pipe_cache = None


def _is_model_cached():
    """仅检查模型是否已完整下载到本地缓存"""
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
        if not os.path.isfile(os.path.join(sub, "model_index.json")):
            continue
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
        print(f"[INFO] Loaded in {time.time()-t0:.1f}s")
        return True
    except Exception as e:
        print(f"[WARN] SSD-1B 加载失败: {str(e)[:120]}")
        _MODEL_READY = False
        return False


def gen_frame_model(pipe, prompt, neg, seed):
    import torch
    generator = torch.Generator("cpu").manual_seed(seed)
    return pipe(prompt=prompt, negative_prompt=neg, num_inference_steps=4,
                guidance_scale=7.5, width=640, height=640, generator=generator).images[0]


def gen_frame_fallback(prompt, width, height, frame_idx, total):
    from PIL import Image, ImageDraw, ImageFont
    h = hashlib.md5((prompt + str(frame_idx)).encode()).hexdigest()
    r1, g1, b1 = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    r2, g2, b2 = int(h[6:8], 16), int(h[8:10], 16), int(h[10:12], 16)

    img = Image.new('RGB', (width, height))
    progress = frame_idx / max(total - 1, 1)
    for y in range(height):
        t = y / height
        r = int(r1 + (r2 - r1) * t + progress * 30) % 256
        g = int(g1 + (g2 - g1) * t + progress * 20) % 256
        b = int(b1 + (b2 - b1) * t + progress * 10) % 256
        for x in range(width):
            img.putpixel((x, y), (r, g, b))

    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 32)
    except Exception:
        font = ImageFont.load_default()

    wrapped = textwrap.wrap(prompt, width=36)
    y_text = height // 4
    for line in wrapped[:4]:
        bbox = draw.textbbox((0, 0), line, font=font)
        draw.text(((width - bbox[2] + bbox[0]) // 2, y_text), line, fill=(255, 255, 255), font=font)
        y_text += 42

    info = f"Frame {frame_idx+1}/{total}  |  {progress*100:.0f}%"
    bbox = draw.textbbox((0, 0), info, font=font)
    draw.text(((width - bbox[2] + bbox[0]) // 2, height - 60), info, fill=(255, 255, 200), font=font)
    return img


def generate_video(base_prompt, neg="", total_frames=20, fps=8):
    use_model = try_load_model()

    frame_dir = os.path.join(OUTPUT_DIR, f"frames_{int(time.time())}")
    os.makedirs(frame_dir, exist_ok=True)
    base_seed = 42

    timings = []
    for i in range(total_frames):
        progress = i / max(total_frames - 1, 1)

        if use_model:
            effects = ["wide shot, distant, peaceful", "medium shot, approaching, energy",
                       "close up, intense, power", "extreme close up, explosion, aura"]
            eff = effects[min(int(progress * len(effects)), len(effects) - 1)]
            p = f"{base_prompt}, {eff}"
            if progress > 0.3:
                p += f", glowing aura intensity {progress:.1f}"

            t0 = time.time()
            img = gen_frame_model(_pipe_cache, p, neg, base_seed + i * 7)
            elapsed = time.time() - t0
        else:
            p = base_prompt
            t0 = time.time()
            img = gen_frame_fallback(p, 640, 640, i, total_frames)
            elapsed = time.time() - t0

        frame_path = os.path.join(frame_dir, f"frame_{i:04d}.png")
        img.save(frame_path)
        timings.append(elapsed)
        avg = sum(timings) / len(timings)
        remaining = avg * (total_frames - i - 1)
        print(f"[FRAME {i+1}/{total_frames}] {elapsed:.1f}s | 预计剩余: {remaining:.0f}s")

    # FFmpeg encode
    print("[FFMPEG] Encoding video...")
    out_path = os.path.join(OUTPUT_DIR, f"video_{int(time.time())}.mp4")
    subprocess.run([
        "ffmpeg", "-y", "-framerate", str(fps),
        "-i", os.path.join(frame_dir, "frame_%04d.png"),
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
        "-pix_fmt", "yuv420p", out_path
    ], check=True, capture_output=True)

    shutil.rmtree(frame_dir, ignore_errors=True)

    size = os.path.getsize(out_path)
    duration = total_frames / fps
    print(f"[SAVE] {out_path} ({size//1024} KB, {duration:.1f}s @ {fps}fps)")

    result = {"filePath": out_path, "size": size, "format": "mp4",
              "frames": total_frames, "fps": fps, "duration": duration}
    print(f"\n[RESULT] {json.dumps(result)}")


if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "Broly Super Saiyan 4, green hair, muscular, anime"
    neg = sys.argv[2] if len(sys.argv) > 2 else "low quality, blurry, ugly"
    frames = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    fps = int(sys.argv[4]) if len(sys.argv) > 4 else 8

    print(f"=== 快速视频生成 ===")
    print(f"Prompt: {prompt[:80]}...")
    print(f"Frames: {frames} @ {fps}fps = {frames/fps:.1f}s 视频")
    generate_video(prompt, neg, frames, fps)
