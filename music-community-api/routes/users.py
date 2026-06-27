"""
用户注册 + 登录路由
"""
import logging

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database import get_db
from exceptions import ConflictError, UnauthorizedError
from models import UserModel
from schemas import UserCreate, UserResponse, TokenResponse
from auth import hash_password, verify_password, create_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


# 1. POST /users/register — 注册
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate, db: Session = Depends(get_db)):
    """
    注册新用户。
    username 已存在 → 409 冲突。
    """
    existing = db.query(UserModel).filter(UserModel.username == body.username).first()
    if existing:
        raise ConflictError(f"用户名 '{body.username}' 已被占用")

    record = UserModel(
        username=body.username,
        hashed_password=hash_password(body.password),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("新用户注册 id=%d username=%s", record.id, record.username)
    return record


# 2. POST /users/login — 登录，返回 JWT
@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    接收 form-data 格式的 username / password。
    验证成功 → 返回 access_token。
    """
    user = db.query(UserModel).filter(UserModel.username == form.username).first()
    if user is None or not verify_password(form.password, user.hashed_password):
        raise UnauthorizedError("用户名或密码错误")

    token = create_access_token({"sub": user.username})
    logger.info("用户 %s 登录成功", user.username)
    return TokenResponse(access_token=token, token_type="bearer")
