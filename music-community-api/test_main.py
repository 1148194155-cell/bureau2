"""
音乐社区 API — 单元测试
使用 TestClient 模拟 HTTP 请求，无需启动服务器。
每个测试函数独立隔离，使用 test.db 数据库。
"""
from fastapi.testclient import TestClient
from main import app


# ─── 辅助函数 ─────────────────────────────────────────────

def register_user(client: TestClient, username: str, password: str):
    """注册用户并返回 Response"""
    return client.post("/users/register", json={
        "username": username,
        "password": password,
    })


def login(client: TestClient, username: str, password: str):
    """登录获取 token，返回 Response"""
    return client.post("/users/login", data={
        "username": username,
        "password": password,
    })


def get_token(client: TestClient, username: str, password: str) -> str:
    """登录并返回 access_token"""
    resp = login(client, username, password)
    return resp.json()["access_token"]


# ─── 测试 1: 公开浏览歌曲 ─────────────────────────────────

def test_get_songs_returns_200(client: TestClient):
    """
    测什么: 未认证用户可以浏览全部歌曲
    验证: 状态码 200，返回列表长度 >= 3（种子数据）
    """
    resp = client.get("/songs/")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 3  # 种子数据有 3 首


# ─── 测试 2: 用户注册 ─────────────────────────────────────

def test_register_user_returns_201(client: TestClient):
    """
    测什么: 注册新用户成功
    验证: 状态码 201，返回 id + username
          返回体中不包含 password，密码不泄露
    """
    resp = register_user(client, "testuser", "testpass")
    assert resp.status_code == 201
    body = resp.json()
    assert "username" in body
    assert "password" not in body  # 不泄露密码！
    assert body["username"] == "testuser"


# ─── 测试 3: 用户登录 ─────────────────────────────────────

def test_login_returns_token(client: TestClient):
    """
    测什么: 注册后登录，获取 JWT
    验证: 状态码 200，返回 access_token，token_type 为 bearer
    """
    # 先注册
    register_user(client, "testuser", "testpass")
    # 再登录
    resp = login(client, "testuser", "testpass")
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


# ─── 测试 4: 上传歌曲需认证 ────────────────────────────────

def test_create_song_needs_auth(client: TestClient):
    """
    测什么: 不带 token 上传歌曲应被拒绝
    验证: 状态码 401
    """
    resp = client.post("/songs/", json={
        "title": "测试歌曲",
        "artist": "测试歌手",
        "genre": "测试",
    })
    assert resp.status_code == 401


# ─── 测试 5: 带 token 上传歌曲 ────────────────────────────

def test_create_song_with_token(client: TestClient):
    """
    测什么: 登录后携带 token 上传歌曲
    验证: 状态码 201，返回的歌名与上传时一致
    """
    # 注册 + 登录
    register_user(client, "testuser", "testpass")
    token = get_token(client, "testuser", "testpass")

    # 上传歌曲
    resp = client.post(
        "/songs/",
        json={"title": "星尘", "artist": "太空人", "genre": "电子"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "星尘"
