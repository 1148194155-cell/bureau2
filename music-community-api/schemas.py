"""
Pydantic 请求 / 响应模型
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ─── User — 用户认证 ──────────────────────────────────────

class UserCreate(BaseModel):
    """注册请求"""
    username: str = Field(..., min_length=1, examples=["alice"])
    password: str = Field(..., min_length=6, examples=["secret123"])


class UserResponse(BaseModel):
    """用户信息响应（不含密码）"""
    id:       int    = Field(..., examples=[1])
    username: str    = Field(..., examples=["alice"])
    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """登录成功返回的 JWT"""
    access_token: str = Field(..., examples=["eyJ..."])
    token_type:   str = Field(default="bearer", examples=["bearer"])


# ─── Song — 歌曲 ─────────────────────────────────────────

class SongCreate(BaseModel):
    """上传歌曲请求（uploaded_by 从 token 取，不暴露）"""
    title:  str = Field(..., examples=["午夜电子梦"])
    artist: str = Field(..., examples=["电子猫"])
    genre:  str = Field(..., examples=["电子"])


class SongResponse(BaseModel):
    """歌曲响应"""
    id:          int      = Field(..., examples=[1])
    title:       str      = Field(..., examples=["午夜电子梦"])
    artist:      str      = Field(..., examples=["电子猫"])
    genre:       str      = Field(..., examples=["电子"])
    uploaded_by: int      = Field(..., examples=[1])
    created_at:  datetime = Field(..., examples=["2026-06-27T12:00:00"])
    model_config = ConfigDict(from_attributes=True)


class SongWithComments(SongResponse):
    """歌曲 + 嵌套评论列表"""
    comments: list["CommentResponse"] = []


# ─── Comment — 评论 ──────────────────────────────────────

class CommentCreate(BaseModel):
    """发布评论请求（user_id 从 token 取）"""
    content: str = Field(..., examples=["这首歌太好听了！"])
    song_id: int = Field(..., examples=[1])


class CommentResponse(BaseModel):
    """评论响应"""
    id:         int      = Field(..., examples=[1])
    content:    str      = Field(..., examples=["这首歌太好听了！"])
    song_id:    int      = Field(..., examples=[1])
    username:   str      = Field(..., examples=["alice"])
    created_at: datetime = Field(..., examples=["2026-06-27T12:00:00"])
    model_config = ConfigDict(from_attributes=True)
