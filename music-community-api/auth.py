"""
JWT 认证工具 — 哈希、签发、校验
"""
from datetime import datetime, timedelta, timezone

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from exceptions import UnauthorizedError
from models import UserModel

# ─── 配置（来自 config.py / .env）─────────────────────────
SECRET_KEY = settings.secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes

# ─── 密码工具 ─────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/login")


def hash_password(plain: str) -> str:
    """明文 → bcrypt 哈希"""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """验证明文 vs 哈希"""
    return pwd_context.verify(plain, hashed)


# ─── JWT ──────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """生成 JWT access_token，内置过期时间"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ─── 依赖：获取当前用户 ────────────────────────────────────

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> UserModel:
    """
    从请求头解析 Bearer token → 解码 → 查用户。
    失败返回 401。
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub: str | None = payload.get("sub")
        if sub is None:
            raise UnauthorizedError("无法验证凭据")
    except JWTError:
        raise UnauthorizedError("无效或过期的 token")

    user = db.query(UserModel).filter(UserModel.username == sub).first()
    if user is None:
        raise UnauthorizedError("用户不存在")

    return user
