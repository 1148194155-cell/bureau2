"""
歌曲 CRUD 路由 — 公开浏览 + 需认证上传/删除
"""
import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from exceptions import NotFoundError, ForbiddenError
from models import SongModel, UserModel
from schemas import SongCreate, SongResponse, SongWithComments, CommentResponse
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/songs", tags=["songs"])


# ─── 种子数据（启动时调用）─────────────────────────────────
def seed_songs():
    """songs 表为空时插入三首示例歌曲"""
    db = SessionLocal()
    try:
        if db.query(SongModel).count() > 0:
            return

        # 查找 admin 用户（注册后再迁移到 seed 逻辑）
        admin = db.query(UserModel).filter(UserModel.username == "admin").first()
        if not admin:
            logger.warning("admin 用户不存在，跳过歌曲种子")
            return

        songs = [
            SongModel(title="午夜电子梦",  artist="电子猫",  genre="电子", uploaded_by=admin.id),
            SongModel(title="南山的格桑花", artist="民谣李",  genre="民谣", uploaded_by=admin.id),
            SongModel(title="霓虹雨",      artist="流行天后", genre="流行", uploaded_by=admin.id),
        ]
        db.add_all(songs)
        db.commit()
        logger.info("种子数据已写入 songs 表")
    finally:
        db.close()


# ─── 路由 ─────────────────────────────────────────────────

# 1. GET /songs — 浏览全部歌曲（公开）
@router.get("/", response_model=list[SongResponse])
def list_songs(db: Session = Depends(get_db)):
    """返回全部歌曲（公开）"""
    return db.query(SongModel).all()


# 2. GET /songs/search?q= — 模糊搜索（公开）
@router.get("/search", response_model=list[SongResponse])
def search_songs(q: str, db: Session = Depends(get_db)):
    """按歌名模糊搜索（公开）"""
    rows = db.query(SongModel).filter(SongModel.title.contains(q)).all()
    return rows


# 3. GET /songs/{song_id} — 单首歌曲 + 评论（公开）
@router.get("/{song_id}", response_model=SongWithComments)
def get_song(song_id: int, db: Session = Depends(get_db)):
    """返回歌曲详情及所有评论（公开）"""
    song = db.query(SongModel).filter(SongModel.id == song_id).first()
    if song is None:
        raise NotFoundError(f"歌曲 {song_id} 不存在")

    # 手动构造嵌套评论
    comments = [
        CommentResponse(
            id=c.id,
            content=c.content,
            song_id=c.song_id,
            username=c.username,  # 来自 CommentModel @property
            created_at=c.created_at,
        )
        for c in song.comments
    ]

    return SongWithComments(
        id=song.id,
        title=song.title,
        artist=song.artist,
        genre=song.genre,
        uploaded_by=song.uploaded_by,
        created_at=song.created_at,
        comments=comments,
    )


# 4. POST /songs — 上传歌曲（需认证）
@router.post("/", response_model=SongResponse, status_code=status.HTTP_201_CREATED)
def create_song(
    body: SongCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """上传新歌，uploaded_by 自动取当前用户"""
    record = SongModel(
        title=body.title,
        artist=body.artist,
        genre=body.genre,
        uploaded_by=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("用户 %s 上传歌曲 id=%d", current_user.username, record.id)
    return record


# 5. DELETE /songs/{song_id} — 删除歌曲（仅上传者本人）
@router.delete("/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_song(
    song_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """只有上传者本人能删除"""
    record = db.query(SongModel).filter(SongModel.id == song_id).first()
    if record is None:
        raise NotFoundError(f"歌曲 {song_id} 不存在")
    if record.uploaded_by != current_user.id:
        raise ForbiddenError("你无权删除此歌曲")

    db.delete(record)
    db.commit()
    logger.info("用户 %s 删除了歌曲 id=%d", current_user.username, song_id)
