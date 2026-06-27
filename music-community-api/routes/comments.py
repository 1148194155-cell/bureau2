"""
评论路由 — 发布 + 删除（仅本人）
"""
import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from exceptions import NotFoundError, ForbiddenError
from models import CommentModel, SongModel, UserModel
from schemas import CommentCreate, CommentResponse
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comments", tags=["comments"])


# 1. POST /comments — 发布评论（需认证）
@router.post("/", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    body: CommentCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """对指定歌曲发表评论"""
    # 校验歌曲存在
    song = db.query(SongModel).filter(SongModel.id == body.song_id).first()
    if song is None:
        raise NotFoundError(f"歌曲 {body.song_id} 不存在")

    record = CommentModel(
        content=body.content,
        song_id=body.song_id,
        user_id=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("用户 %s 评论了歌曲 id=%d", current_user.username, body.song_id)

    return CommentResponse(
        id=record.id,
        content=record.content,
        song_id=record.song_id,
        username=current_user.username,
        created_at=record.created_at,
    )


# 2. DELETE /comments/{comment_id} — 删除评论（仅评论者本人）
@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """只有评论者本人能删除"""
    record = db.query(CommentModel).filter(CommentModel.id == comment_id).first()
    if record is None:
        raise NotFoundError(f"评论 {comment_id} 不存在")
    if record.user_id != current_user.id:
        raise ForbiddenError("你无权删除此评论")

    db.delete(record)
    db.commit()
    logger.info("用户 %s 删除了评论 id=%d", current_user.username, comment_id)
