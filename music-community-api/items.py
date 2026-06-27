"""
待办事项 CRUD 路由 — 需 JWT 认证
"""
import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from exceptions import NotFoundError
from models import ItemModel, UserModel
from schemas import ItemCreate, ItemResponse, ItemUpdate
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/items", tags=["items"])


# ─── 种子数据（启动时调用一次）─────────────────────────────
def seed_items():
    """表为空时填入两条示例数据"""
    db = SessionLocal()
    try:
        if db.query(ItemModel).count() == 0:
            db.add_all([
                ItemModel(name="买牛奶", done=False),
                ItemModel(name="写周报", done=True),
            ])
            db.commit()
            logger.info("种子数据已写入 items 表")
    finally:
        db.close()


# ─── 路由 ─────────────────────────────────────────────────

# 1. GET /items — 查询全部
@router.get("/", response_model=list[ItemResponse])
def list_items(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    """返回全部待办事项"""
    items = db.query(ItemModel).all()
    logger.info("用户 %s 查询了 %d 条待办", current_user.username, len(items))
    return items


# 2. POST /items — 新增
@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(body: ItemCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    """新增一条待办"""
    record = ItemModel(name=body.name, done=body.done)
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("用户 %s 创建了待办 id=%d name=%s", current_user.username, record.id, record.name)
    return record


# 3. PUT /items/{item_id} — 更新（部分更新）
@router.put("/{item_id}", response_model=ItemResponse)
def update_item(item_id: int, body: ItemUpdate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    """
    按 id 更新，只修改前端传了的字段。
    找不到 → 404。
    """
    record = db.query(ItemModel).filter(ItemModel.id == item_id).first()
    if record is None:
        raise NotFoundError(f"待办项 {item_id} 不存在")

    if body.name is not None:
        record.name = body.name
    if body.done is not None:
        record.done = body.done

    db.commit()
    db.refresh(record)
    logger.info("用户 %s 更新了待办 id=%d", current_user.username, item_id)
    return record


# 4. DELETE /items/{item_id} — 删除
@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    """
    按 id 删除，返回 204 无内容。
    找不到 → 404。
    """
    record = db.query(ItemModel).filter(ItemModel.id == item_id).first()
    if record is None:
        raise NotFoundError(f"待办项 {item_id} 不存在")

    db.delete(record)
    db.commit()
    logger.info("用户 %s 删除了待办 id=%d", current_user.username, item_id)
