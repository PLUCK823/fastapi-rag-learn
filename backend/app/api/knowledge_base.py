"""知识库 + 文档管理路由（同步，避免 greenlet）"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import delete, desc, func
from sqlalchemy import select as sa_select
from sqlalchemy.orm import Session

from app.core.auth import current_user
from app.core.database import get_sync_session
from app.core.engine import get_document_content
from app.models.chat import ChatMessage
from app.models.schemas import (
    DocCreateRequest,
    DocInfo,
    DocRenameRequest,
    DocUpdateRequest,
    KBCreateRequest,
    KBDeleteResponse,
    KBDetail,
    KBInfo,
    KBRenameRequest,
    MessageInfo,
    SessionInfo,
)
from app.models.user import User
from app.services import knowledge_base as kb_service

router = APIRouter(prefix="/kb", tags=["knowledge_base"])

# 支持的文件类型
_ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


def _parse_upload(file: UploadFile) -> str:
    """解析上传文件内容，支持 txt / md / pdf"""
    raw = file.file.read()
    filename = file.filename or "untitled"

    ext = filename.lower()
    if not any(ext.endswith(e) for e in _ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型，仅支持: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="文件编码不是 UTF-8，请转换后上传")

    if ext.endswith(".pdf"):
        try:
            from io import BytesIO

            from pypdf import PdfReader

            reader = PdfReader(BytesIO(raw))
            pages: list[str] = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    pages.append(t)
            text = "\n\n".join(pages)
            if not text.strip():
                raise HTTPException(status_code=400, detail="PDF 文件中没有可提取的文字")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PDF 解析失败: {e}")

    return text.strip()


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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    if include_docs:
        return kb_service.list_kbs_with_docs(session, user.id, page=page, page_size=page_size)
    return kb_service.list_kbs(session, user.id, page=page, page_size=page_size)


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


@router.post("/{kb_id}/upload", response_model=DocInfo)
def upload_document(
    kb_id: int,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """上传文件（txt / md / pdf）到知识库"""
    content = _parse_upload(file)
    filename = file.filename or "untitled"
    doc = kb_service.add_document(session, kb_id, user.id, content, filename)
    return DocInfo.model_validate(doc)


@router.get("/{kb_id}/docs", response_model=list[DocInfo])
def list_documents(
    kb_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    docs = kb_service.list_documents(session, kb_id, user.id, page=page, page_size=page_size)
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


@router.put("/{kb_id}/docs/{doc_id}/rename", response_model=DocInfo)
def rename_document(
    kb_id: int,
    doc_id: int,
    req: DocRenameRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    doc = kb_service.rename_document(session, kb_id, doc_id, user.id, req.filename)
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
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb_service._get_kb(session, kb_id, user.id)
    offset = (page - 1) * page_size
    result = session.execute(
        sa_select(ChatMessage)
        .where(ChatMessage.kb_id == kb_id, ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at)
        .offset(offset)
        .limit(page_size)
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


# ── Chat Sessions ──


@router.get("/{kb_id}/sessions", response_model=list[SessionInfo])
def list_sessions(
    kb_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """列出该知识库下所有会话（按最后活跃时间倒序）"""
    kb_service._get_kb(session, kb_id, user.id)

    rows = session.execute(
        sa_select(
            ChatMessage.session_id,
            func.count(ChatMessage.id).label("message_count"),
            func.min(ChatMessage.created_at).label("created_at"),
            func.max(ChatMessage.created_at).label("updated_at"),
        )
        .where(
            ChatMessage.kb_id == kb_id,
            ChatMessage.user_id == user.id,
            ChatMessage.session_id.isnot(None),
        )
        .group_by(ChatMessage.session_id)
        .order_by(desc(func.max(ChatMessage.created_at)))
    ).all()

    result: list[SessionInfo] = []
    for row in rows:
        # 取该 session 的第一条 user 消息作为预览
        first_msg = session.execute(
            sa_select(ChatMessage)
            .where(
                ChatMessage.kb_id == kb_id,
                ChatMessage.user_id == user.id,
                ChatMessage.session_id == row.session_id,
                ChatMessage.role == "user",
            )
            .order_by(ChatMessage.created_at)
            .limit(1)
        ).scalar()

        result.append(
            SessionInfo(
                session_id=row.session_id,
                first_question=first_msg.content if first_msg else "",
                message_count=row.message_count,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )
    return result


@router.get("/{kb_id}/sessions/{session_id}/messages", response_model=list[MessageInfo])
def list_session_messages(
    kb_id: int,
    session_id: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """获取指定会话的所有消息"""
    kb_service._get_kb(session, kb_id, user.id)
    result = session.execute(
        sa_select(ChatMessage)
        .where(
            ChatMessage.kb_id == kb_id,
            ChatMessage.user_id == user.id,
            ChatMessage.session_id == session_id,
        )
        .order_by(ChatMessage.created_at)
    )
    return result.scalars().all()


@router.delete("/{kb_id}/sessions/{session_id}")
def delete_session(
    kb_id: int,
    session_id: str,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """删除指定会话及其所有消息"""
    kb_service._get_kb(session, kb_id, user.id)
    session.execute(
        delete(ChatMessage).where(
            ChatMessage.kb_id == kb_id,
            ChatMessage.user_id == user.id,
            ChatMessage.session_id == session_id,
        )
    )
    session.commit()
    return {"message": "会话已删除"}
