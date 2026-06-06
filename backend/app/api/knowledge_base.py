"""知识库 + 文档管理路由（同步，避免 greenlet）"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import delete, desc, func
from sqlalchemy import exc as sa_exc
from sqlalchemy import select as sa_select
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from arq.connections import ArqRedis

from app.core.auth import current_user
from app.core.database import get_sync_session
from app.core.engine import get_document_content
from app.core.redis import get_task_status
from app.models.chat import ChatMessage
from app.models.schemas import (
    BatchDeleteRequest,
    BatchDeleteResponse,
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
    PaginatedResponse,
    SessionInfo,
    TaskInfo,
)
from app.models.user import User
from app.services import knowledge_base as kb_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kb", tags=["knowledge_base"])

# 支持的文件类型
_ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf", ".docx"}
_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB

# Docling converter 单例（懒加载，避免首次启动开销）
_docling_converter = None


def _get_docling_converter():
    """获取 Docling converter（首次调用时加载模型）"""
    global _docling_converter
    if _docling_converter is None:
        import os

        # macOS MPS 不兼容 float64，强制 CPU
        os.environ.setdefault("DOCLING_DEVICE", "cpu")
        from docling.document_converter import DocumentConverter

        _docling_converter = DocumentConverter()
    return _docling_converter


def _parse_with_docling(raw: bytes, suffix: str) -> str:
    """用 Docling 解析 PDF/DOCX → Markdown（保留表格 + 阅读顺序 + 标题层级）"""
    import os
    import tempfile

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name

        try:
            converter = _get_docling_converter()
            result = converter.convert(tmp_path)
            text = result.document.export_to_markdown()
            if not text.strip():
                raise HTTPException(status_code=400, detail="PDF 文件中没有可提取的文字")
            return text.strip()
        finally:
            os.unlink(tmp_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF 解析失败: {e}")


def _parse_upload(raw: bytes, filename: str) -> str:
    """解析上传文件内容，支持 txt / md / pdf / docx"""
    ext = filename.lower()

    # PDF / DOCX 二进制文件 → Docling
    if ext.endswith(".pdf") or ext.endswith(".docx"):
        return _parse_with_docling(raw, ext)

    # txt / md → UTF-8 文本
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="文件编码不是 UTF-8，请转换后上传")

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


@router.get("", response_model=PaginatedResponse[KBInfo] | PaginatedResponse[KBDetail])
def list_kbs(
    include_docs: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    if include_docs:
        items = kb_service.list_kbs_with_docs(session, user.id, page=page, page_size=page_size)
        total = kb_service.count_kbs(session, user.id)
    else:
        items = kb_service.list_kbs(session, user.id, page=page, page_size=page_size)
        total = kb_service.count_kbs(session, user.id)
    total_pages = (total + page_size - 1) // page_size
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{kb_id}", response_model=KBDetail)
def get_kb(
    kb_id: int,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    kb = kb_service._get_kb(session, kb_id, user.id)
    return KBDetail(
        id=kb.id,
        name=kb.name,
        document_count=sum(1 for d in kb.documents if d.status == "ready"),
        documents=[DocInfo.model_validate(d) for d in kb.documents],
        created_at=kb.created_at,
    )


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


async def _parse_and_enqueue(
    redis: ArqRedis,
    task_id: str,
    doc_id: int,
    kb_id: int,
    user_id: int,
    raw: bytes,
    orig_filename: str,
    filename: str,
) -> None:
    """后台：解析文件 → 入队 ARQ worker（解析在线程中运行，不阻塞事件循环）"""
    import logging as _logging

    _log = _logging.getLogger(__name__)

    from app.core.database import sync_session_factory
    from app.core.redis import update_task_progress
    from app.models.knowledge_base import Document as DocModel

    try:
        content = await asyncio.to_thread(_parse_upload, raw, orig_filename)
    except Exception as exc:
        err_msg = str(exc) if str(exc) else type(exc).__name__
        _log.exception("Parse failed for %s (doc %d)", orig_filename, doc_id)
        await update_task_progress(redis, task_id, "failed", 0, err_msg[:200])
        with sync_session_factory() as s:
            doc = s.get(DocModel, doc_id)
            if doc:
                doc.status = "failed"
                doc.error_message = err_msg[:500]
                s.commit()
        return

    await update_task_progress(redis, task_id, "pending", 0, "排队中…")
    await redis.enqueue_job(
        "ingest_document",
        kb_id=kb_id,
        user_id=user_id,
        content=content,
        filename=filename,
        doc_id=doc_id,
        _job_id=task_id,
    )


@router.post("/{kb_id}/upload", status_code=202)
async def upload_document(
    kb_id: int,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """上传文件（txt / md / pdf / docx）— 返回 task_id，后台异步处理"""

    raw = file.file.read()
    orig_filename = file.filename or "untitled"  # 保留原始后缀（用于解析判断）

    # ① 快速校验（大小 + 格式）
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="文件大小不能超过 50MB")
    if not any(orig_filename.lower().endswith(e) for e in _ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型，仅支持: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )

    # PDF/DOCX 经 Docling 已转为 Markdown，统一后缀（仅数据库存储名）
    import os as _os

    orig_basename = _os.path.splitext(orig_filename)[0]
    if _os.path.splitext(orig_filename)[1].lower() in {".pdf", ".docx"}:
        filename = f"{orig_basename}.md"
    else:
        filename = orig_filename

    # ② 查重（按基础名）
    existing = session.execute(
        sa_select(kb_service.Document).where(
            kb_service.Document.kb_id == kb_id,
            func.split_part(kb_service.Document.filename, ".", 1) == orig_basename,
            kb_service.Document.status != "failed",
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="知识库中已存在同名文档")

    # 自动清理卡死的 processing 文档
    from datetime import UTC, datetime, timedelta

    stale_cutoff = datetime.now(UTC) - timedelta(minutes=5)
    stale_docs = (
        session.execute(
            sa_select(kb_service.Document).where(
                kb_service.Document.kb_id == kb_id,
                kb_service.Document.status == "processing",
                kb_service.Document.created_at < stale_cutoff,
            )
        )
        .scalars()
        .all()
    )
    if stale_docs:
        for sd in stale_docs:
            sd.status = "failed"
            sd.error_message = "Worker 未响应（超过 5 分钟），自动标记为失败"
        session.commit()
        logger.info("Auto-failed %d stale processing docs in kb %d", len(stale_docs), kb_id)

    # ③ 先创建 tracking 记录 + task_id，前端立刻看到进度
    task_id = str(uuid4())
    import app.main as _main_mod
    from app.core.redis import update_task_progress

    app_instance = _main_mod.app
    redis = getattr(app_instance.state, "redis", None)

    if redis:
        doc = kb_service.Document(kb_id=kb_id, filename=filename, status="processing")
        session.add(doc)
        session.commit()
        session.refresh(doc)

        await update_task_progress(redis, task_id, "parsing", 5, "正在解析文档…")

        # ④ 解析 + 入队放到后台 → 响应立刻返回 task_id
        asyncio.create_task(
            _parse_and_enqueue(
                redis,
                task_id,
                doc.id,
                kb_id,
                user.id,
                raw,
                orig_filename,
                filename,
            )
        )
        return {"doc_id": doc.id, "task_id": task_id, "status": "processing"}

    # Redis 不可用 → 同步处理
    try:
        content = _parse_upload(raw, orig_filename)
    except HTTPException:
        raise
    try:
        doc = kb_service.add_document(session, kb_id, user.id, content, filename)
    except sa_exc.IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="知识库中已存在同名文档")
    return {"doc_id": doc.id, "task_id": task_id, "status": "ready", "sync": True}


@router.get("/tasks/{task_id}")
async def poll_task(task_id: str):
    """轮询异步任务进度"""
    try:
        import app.main as _main_mod

        app_instance = _main_mod.app
        redis = getattr(app_instance.state, "redis", None)
        if redis:
            data = await get_task_status(redis, task_id)
            return TaskInfo(
                task_id=task_id,
                status=data.get("status", "unknown"),
                progress=int(data.get("progress", "0")),
                message=data.get("message", ""),
            )
    except Exception:
        pass
    return TaskInfo(task_id=task_id, status="done", progress=100, message="ok")


@router.post("/{kb_id}/docs/batch-delete", response_model=BatchDeleteResponse)
def batch_delete_docs(
    kb_id: int,
    req: BatchDeleteRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """批量删除文档 — 先校验所有权（单条 SQL），再批量 DELETE，最后异步清理向量库"""
    from app.core.engine import delete_document_chunks

    # ① 先校验 kb 所有权
    kb_service._get_kb(session, kb_id, user.id)

    # ② 查询该 KB 下属于请求的文档 ID（确保用户拥有这些文档）
    existing = (
        session.execute(
            sa_select(kb_service.Document.id).where(
                kb_service.Document.kb_id == kb_id,
                kb_service.Document.id.in_(req.doc_ids),
            )
        )
        .scalars()
        .all()
    )
    valid_ids = set(existing)

    if not valid_ids:
        return BatchDeleteResponse(deleted_count=0)

    # ③ 批量删除（单条 SQL，避免 N+1）
    stmt = delete(kb_service.Document).where(kb_service.Document.id.in_(list(valid_ids)))
    session.execute(stmt)
    session.commit()
    deleted_count = len(valid_ids)

    # ④ 异步清理 Qdrant 向量数据（失败不阻塞）
    for doc_id in valid_ids:
        try:
            delete_document_chunks(kb_id, doc_id)
        except Exception:
            pass  # Qdrant 清理失败不阻塞，孤儿由定期任务兜底

    return BatchDeleteResponse(deleted_count=deleted_count)


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
    session_id: str | None = None,
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """清空聊天记录。如果指定 session_id，只清空该会话；否则清空全部。"""
    kb_service._get_kb(session, kb_id, user.id)
    stmt = delete(ChatMessage).where(ChatMessage.kb_id == kb_id, ChatMessage.user_id == user.id)
    if session_id:
        stmt = stmt.where(ChatMessage.session_id == session_id)
    session.execute(stmt)
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


@router.get("/{kb_id}/search-messages")
def search_messages(
    kb_id: int,
    q: str = Query(..., min_length=1, description="搜索关键词"),
    user: User = Depends(current_user),
    session: Session = Depends(get_sync_session),
):
    """搜索知识库下的消息内容，返回匹配的消息所在会话"""
    kb_service._get_kb(session, kb_id, user.id)
    results = session.execute(
        sa_select(ChatMessage)
        .where(
            ChatMessage.kb_id == kb_id,
            ChatMessage.user_id == user.id,
            ChatMessage.content.contains(q),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(50)
    )
    msgs = results.scalars().all()

    # Deduplicate by session_id and build session summaries
    seen_sessions: dict[str, dict] = {}
    for msg in msgs:
        sid = msg.session_id or ""
        if sid not in seen_sessions:
            # Get the first user message of this session for preview
            first_user = session.execute(
                sa_select(ChatMessage)
                .where(
                    ChatMessage.kb_id == kb_id,
                    ChatMessage.user_id == user.id,
                    ChatMessage.session_id == sid,
                    ChatMessage.role == "user",
                )
                .order_by(ChatMessage.created_at)
                .limit(1)
            ).scalar()
            seen_sessions[sid] = {
                "session_id": sid,
                "first_question": first_user.content if first_user else "",
                "match_snippet": msg.content[:120],
                "updated_at": msg.created_at,
            }

    return list(seen_sessions.values())


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
