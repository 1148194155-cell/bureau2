"""
SQLAlchemy ORM 模型 — User / Song / Comment 三表关联
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class UserModel(Base):
    """用户表"""
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    username        = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    # 反向关系
    songs    = relationship("SongModel",    back_populates="owner")
    comments = relationship("CommentModel", back_populates="user")


class SongModel(Base):
    """歌曲表"""
    __tablename__ = "songs"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    title       = Column(String, nullable=False)       # 歌名
    artist      = Column(String, nullable=False)        # 歌手
    genre       = Column(String, nullable=False)        # 风格
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # 关系
    owner    = relationship("UserModel",    back_populates="songs")
    comments = relationship("CommentModel", back_populates="song", cascade="all, delete-orphan")

    @property
    def username(self) -> str:
        """便于 Pydantic from_attributes 读取上传者用户名"""
        return self.owner.username if self.owner else ""


class CommentModel(Base):
    """评论表"""
    __tablename__ = "comments"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    content    = Column(String, nullable=False)         # 评论内容
    song_id    = Column(Integer, ForeignKey("songs.id"), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # 关系
    song = relationship("SongModel", back_populates="comments")
    user = relationship("UserModel", back_populates="comments")

    @property
    def username(self) -> str:
        """便于 Pydantic from_attributes 读取评论者用户名"""
        return self.user.username if self.user else ""
