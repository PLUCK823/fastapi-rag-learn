"""知识库 + 文档管理路由（同步，避免 greenlet）"""

from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy import select as sa_select
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_sync_session
from app.core.engine import get_document_content
from app.models.chat import ChatMessage
from app.models.schemas import (
    DocCreateRequest,
    DocInfo,
    DocUpdateRequest,
    KBCreateRequest,
    KBDeleteResponse,
    KBDetail,
    KBInfo,
    KBRenameRequest,
    MessageInfo,
)
from app.models.user import User
from app.services import knowledge_base as kb_service

router = APIRouter(prefix="/kb", tags=["knowledge_base"])


# ── KB ──

@router.post("", response_model=KBInfo)
def create_kb(
    req: KBCreateRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb = kb_service.create_kb(session, user.id, req.name)
    return KBInfo(
        id=kb.id,
        name=kb.name,
        document_count=0,
        created_at=kb.created_at,
    )


@router.get("", response_model=list[KBInfo] | list[KBDetail])
def list_kbs(
    include_docs: bool = False,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    if include_docs:
        return kb_service.list_kbs_with_docs(session, user.id)
    return kb_service.list_kbs(session, user.id)


@router.put("/{kb_id}", response_model=KBInfo)
def rename_kb(
    kb_id: int,
    req: KBRenameRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb = kb_service.rename_kb(session, kb_id, user.id, req.name)
    return KBInfo(
        id=kb.id,
        name=kb.name,
        document_count=len(kb.documents),
        created_at=kb.created_at,
    )


@router.delete("/{kb_id}", response_model=KBDeleteResponse)
def delete_kb(
    kb_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    doc_count = kb_service.delete_kb(session, kb_id, user.id)
    return KBDeleteResponse(
        message=f"知识库已删除，共删除 {doc_count} 篇文档",
        deleted_document_count=doc_count,
    )


# ── Documents ──

@router.post("/{kb_id}/docs", response_model=DocInfo)
def add_document(
    kb_id: int,
    req: DocCreateRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    doc = kb_service.add_document(session, kb_id, user.id, req.content, req.filename)
    return DocInfo.model_validate(doc)


@router.get("/{kb_id}/docs", response_model=list[DocInfo])
def list_documents(
    kb_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    docs = kb_service.list_documents(session, kb_id, user.id)
    return [DocInfo.model_validate(d) for d in docs]


@router.put("/{kb_id}/docs/{doc_id}", response_model=DocInfo)
def update_document(
    kb_id: int,
    doc_id: int,
    req: DocUpdateRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    doc = kb_service.update_document(session, kb_id, doc_id, user.id, req.content)
    return DocInfo.model_validate(doc)


@router.delete("/{kb_id}/docs/{doc_id}")
def delete_document(
    kb_id: int,
    doc_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb_service.delete_document(session, kb_id, doc_id, user.id)
    return {"message": "文档已删除"}


@router.get("/{kb_id}/docs/{doc_id}/content")
def get_doc_content(
    kb_id: int,
    doc_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb_service.get_document(session, kb_id, doc_id, user.id)  # 校验所有权
    return {"content": get_document_content(kb_id, doc_id)}


# ── Chat Messages ──

@router.get("/{kb_id}/messages", response_model=list[MessageInfo])
def list_messages(
    kb_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb_service._get_kb(session, kb_id, user.id)
    result = session.execute(
        sa_select(ChatMessage)
        .where(ChatMessage.kb_id == kb_id, ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at)
    )
    return result.scalars().all()


@router.delete("/{kb_id}/messages")
def clear_messages(
    kb_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb_service._get_kb(session, kb_id, user.id)
    session.execute(
        delete(ChatMessage).where(
            ChatMessage.kb_id == kb_id, ChatMessage.user_id == user.id
        )
    )
    session.commit()
    return {"message": "聊天记录已清空"}
