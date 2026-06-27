"""
pytest 配置 — 测试数据库隔离 + TestClient
"""
import os
import pytest
from fastapi.testclient import TestClient

# ─── 1. 切换数据库为 test.db（必须在导入 main/app 之前）───
from config import settings
settings.database_url = "sqlite:///./test.db"

# ─── 2. 现在导入手——此时 engine 会使用 test.db ──────────
from main import app
from database import Base, engine, SessionLocal


@pytest.fixture(autouse=True)
def setup_test_db():
    """
    每个测试函数自动执行：
      - 创建所有表（空表）
      - 测试结束后 drop 所有表（完全隔离）
    """
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    """返回 TestClient，模拟 HTTP 请求"""
    with TestClient(app) as c:
        yield c
