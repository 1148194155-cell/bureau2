"""
音乐社区 API — FastAPI 多表关联后端
运行: uvicorn main:app --reload --port 8000
"""
import uvicorn
from fastapi import FastAPI

from config import settings
from database import engine, Base, SessionLocal
from logging_config import setup_logging
from handlers import register_exception_handlers
from routes.users import router as users_router
from routes.songs import router as songs_router, seed_songs
from routes.comments import router as comments_router
from models import UserModel
from auth import hash_password


import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def ensure_data_dir():
    """确保 SQLite 数据库目录存在（Render 首次部署需要）"""
    db_path = settings.database_url.replace("sqlite:///", "")
    parent = Path(db_path).parent
    if parent and not parent.exists():
        parent.mkdir(parents=True, exist_ok=True)
        logger.info("创建数据库目录: %s", parent)


def seed_admin():
    """users 表为空时创建 admin 用户"""
    db = SessionLocal()
    try:
        if db.query(UserModel).count() == 0:
            db.add(UserModel(
                username="admin",
                hashed_password=hash_password("admin123"),
            ))
            db.commit()
            logger.info("种子用户 admin 已创建")
    finally:
        db.close()


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用"""
    setup_logging(settings.log_level)

    app = FastAPI(title="音乐社区 API", version="1.0.0", debug=settings.debug)

    register_exception_handlers(app)

    app.include_router(users_router)
    app.include_router(songs_router)
    app.include_router(comments_router)

    @app.on_event("startup")
    def on_startup():
        ensure_data_dir()
        Base.metadata.create_all(bind=engine)
        seed_admin()
        seed_songs()
        logger.info("Application started — 音乐社区 API")

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower(),
    )

"""
─────────────────────────────────────────────────────────────
启动：
    uvicorn main:app --reload --port 8000

测试命令 ─────────────────────────────────────────────────

# 1. 注册新用户
curl -X POST http://127.0.0.1:8000/users/register ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"alice\",\"password\":\"alice123\"}"

# 2. 登录拿 token
curl -X POST http://127.0.0.1:8000/users/login ^
  -H "Content-Type: application/x-www-form-urlencoded" ^
  -d "username=alice&password=alice123"

# 3. GET /songs — 公开浏览 3 首种子歌曲
curl http://127.0.0.1:8000/songs/

# 4. GET /songs/1 — 嵌套评论数据（早期为空）
curl http://127.0.0.1:8000/songs/1

# 5. POST /songs — 上传新歌（需 token，<TOKEN> 换成第 2 步的值）
curl -X POST http://127.0.0.1:8000/songs/ ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -d "{\"title\":\"星尘\",\"artist\":\"太空人\",\"genre\":\"电子\"}"

# 6. GET /songs/search?q=电子 — 模糊搜索
curl "http://127.0.0.1:8000/songs/search?q=%E7%94%B5%E5%AD%90"

# 7. POST /comments — 给歌曲 1 发评论（需 token）
curl -X POST http://127.0.0.1:8000/comments/ ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -d "{\"content\":\"这首歌太好听了！\",\"song_id\":1}"

# 8. GET /songs/1 — 验证评论已挂载
curl http://127.0.0.1:8000/songs/1

# 9. DELETE /songs/3 — 非本人删除（用 alice 删 admin 的歌）→ 403
curl -X DELETE http://127.0.0.1:8000/songs/3 ^
  -H "Authorization: Bearer <TOKEN>"

# Swagger: http://127.0.0.1:8000/docs
"""
