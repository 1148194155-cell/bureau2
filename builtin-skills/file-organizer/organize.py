#!/usr/bin/env python3
"""文件整理助手：按文件类型自动归类到子目录"""
import os, sys, json, shutil
from pathlib import Path

CATEGORIES = {
    "图片": [".jpg",".jpeg",".png",".gif",".bmp",".webp",".svg",".ico"],
    "文档": [".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt",".md",".csv"],
    "视频": [".mp4",".avi",".mkv",".mov",".wmv",".flv",".webm"],
    "音频": [".mp3",".wav",".flac",".aac",".ogg",".wma"],
    "压缩包": [".zip",".rar",".7z",".tar",".gz",".bz2"],
    "代码": [".py",".js",".ts",".html",".css",".json",".xml",".yaml",".sh"],
}

def get_category(filename):
    ext = Path(filename).suffix.lower()
    for cat, exts in CATEGORIES.items():
        if ext in exts: return cat
    return "其他"

def organize(target_dir, pattern=None):
    target = Path(target_dir)
    if not target.exists(): return {"error": f"目录不存在: {target_dir}"}
    files = list(target.glob(pattern or "*"))
    moved = {}
    for f in files:
        if not f.is_file(): continue
        cat = get_category(f.name)
        cat_dir = target / cat
        cat_dir.mkdir(exist_ok=True)
        dest = cat_dir / f.name
        if dest.exists():
            stem, ext2 = os.path.splitext(f.name)
            dest = cat_dir / f"{stem}_副本{ext2}"
        shutil.move(str(f), str(dest))
        moved.setdefault(cat, []).append(f.name)
    return {"success": True, "organized": sum(len(v) for v in moved.values()),
            "categories": {k: len(v) for k, v in moved.items()}}

if __name__ == "__main__":
    args = json.loads(sys.stdin.read()) if len(sys.argv) < 2 else {"target_dir": sys.argv[1]}
    result = organize(args.get("target_dir"), args.get("pattern"))
    print(json.dumps(result, ensure_ascii=False))
