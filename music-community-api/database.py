"""
数据库引擎与会话管理
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from config import settings

# ─── SQLite 数据库（URL 来自配置）─────────────────────────
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # FastAPI 多线程需要
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI 依赖：每次请求生成一个数据库会话，用完关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
