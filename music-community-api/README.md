# 音乐社区 API — FastAPI 多表关联后端

音乐社区后端 API，支持用户注册登录、歌曲上传浏览、评论互动。

## 核心亮点

1. **三表关联（User → Song ← Comment）** — 外键 + SQLAlchemy `relationship`，支持嵌套序列化
2. **JWT 认证 + Ownership 权限校验** — 只能删自己的歌/评论，他人操作返回 `403`
3. **分层架构 + 全局异常处理 + 日志** — config / database / handlers / logging_config 各司其职

## 技术栈

- **FastAPI** + **Pydantic v2**
- **SQLAlchemy** + **SQLite**
- **JWT 认证** (python-jose + bcrypt)

## 快速开始

```bash
git clone https://github.com/YOUR_USERNAME/music-community-api.git
cd music-community-api

python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS / Linux

pip install -r requirements.txt

cp .env.example .env

python main.py
```

访问 [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

## API 端点

### 用户

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /users/register | 注册 | ❌ |
| POST | /users/login | 登录，返回 JWT | ❌ |

### 歌曲

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /songs | 浏览全部歌曲 | ❌ 公开 |
| GET | /songs/{id} | 单首歌曲 + 评论 | ❌ 公开 |
| GET | /songs/search?q= | 按歌名模糊搜索 | ❌ 公开 |
| POST | /songs | 上传歌曲 | ✅ |
| DELETE | /songs/{id} | 删除歌曲（仅上传者） | ✅ + Owner |

### 评论

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /comments | 发表评论 | ✅ |
| DELETE | /comments/{id} | 删除评论（仅评论者） | ✅ + Owner |

## 在线演示

部署在 Render 免费实例，首次加载需 ~30s 冷启动。

```
https://YOUR_URL.onrender.com/docs
```

> ⚠️ 免费实例 15 分钟无请求后休眠，磁盘重置。种子数据自动恢复，用户注册数据会丢。
> 适合面试官快速验证 API 功能，生产环境建议换 PostgreSQL。

## Docker 部署

```bash
docker compose up --build
```

启动后访问 [http://localhost:8000/docs](http://localhost:8000/docs)

- 首次启动自动建表 + 写入种子数据
- SQLite 文件保存在本地 `data/` 目录，重启不丢失
- 停服：`Ctrl+C` → `docker compose down`

## 项目结构

```
music-community-api/
├── main.py              # 入口 + 种子数据
├── config.py            # 配置 (pydantic-settings)
├── database.py          # SQLAlchemy engine + session
├── models.py            # UserModel / SongModel / CommentModel
├── schemas.py           # Pydantic 请求/响应
├── auth.py              # JWT + bcrypt
├── exceptions.py        # 自定义异常
├── handlers.py          # 全局异常处理器
├── logging_config.py    # 日志配置
├── routes/
│   ├── users.py         # 注册 / 登录
│   ├── songs.py         # 歌曲 CRUD + 搜索
│   └── comments.py      # 评论 CRUD
├── requirements.txt
└── .env.example
```
