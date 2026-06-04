"""知识库 CRUD + 文档管理（同步 SQLAlchemy，避免 greenlet）"""

import re
from datetime import UTC, datetime

from fastapi import HTTPException
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import CHUNK_OVERLAP, CHUNK_SIZE
from app.core.engine import (
    _invalidate_bm25_cache,
    delete_collection,
    delete_document_chunks,
    get_vectorstore,
)
from app.models.knowledge_base import Document, KnowledgeBase

# Markdown 表格检测（保护表格不被切分）
_TABLE_RE = re.compile(
    r"(\|.+\|\s*\n\|[-| :]+\|\s*\n(?:\|.+\|\s*\n?)+)", re.MULTILINE
)

# MarkdownHeaderTextSplitter 切分层级
_HEADERS_TO_SPLIT = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
    ("####", "h4"),
]


def _splitter() -> RecursiveCharacterTextSplitter:
    """中文优化分隔符：段落→换行→中文句末标点→中文句中→英文标点→空格"""
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=[
            "\n\n",
            "\n",
            "。", "？", "！",  # 中文句末标点
            "；", "：", "，",  # 中文句中标点
            ". ", "? ", "! ",
            "; ", ": ", ", ",
            " ",
        ],
    )


def _build_context(filename: str, metadata: dict) -> str:
    """从 MarkdownHeaderTextSplitter 的 header metadata 构建上下文前缀"""
    ctx = f"文档: {filename}"
    headers = []
    for level in ["h1", "h2", "h3", "h4"]:
        h = metadata.get(level)
        if h:
            headers.append(h)
    if headers:
        ctx += "\n章节: " + " > ".join(headers)
    return ctx


def _extract_tables(content: str) -> tuple[str, list[str]]:
    """提取 Markdown 表格，返回 (去表后的文本, 表格列表)"""
    tables: list[str] = []

    def _repl(m: re.Match) -> str:
        tables.append(m.group(1))
        return f"\n\n[表格 {len(tables)}]\n\n"

    remaining = _TABLE_RE.sub(_repl, content)
    return remaining, tables


def _split_oversized(
    content: str, filename: str, ctx: str, base_metadata: dict
) -> list[LCDocument]:
    """对超长 section 二次切分（先保护表格，再字符级切分）"""
    remaining, tables = _extract_tables(content)

    sub_chunks = _splitter().split_documents(
        [LCDocument(page_content=remaining, metadata={"source": filename})]
    )

    result: list[LCDocument] = []
    for sc in sub_chunks:
        sc.page_content = f"{ctx}\n\n{sc.page_content}"
        sc.metadata.update(base_metadata)
        result.append(sc)

    # 每个表格作为独立 chunk（保持完整不切分）
    for t_idx, table_text in enumerate(tables):
        result.append(
            LCDocument(
                page_content=f"{ctx}\n\n{table_text.strip()}",
                metadata={
                    **base_metadata,
                    "source": filename,
                    "is_table": True,
                    "table_index": t_idx,
                },
            )
        )

    return result


def _split_content(content: str, filename: str) -> list[LCDocument]:
    """切分文档内容：优先 Markdown 标题感知切分，纯文本 fallback 到字符级"""

    # 1. 尝试 Markdown 标题感知切分
    md_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=_HEADERS_TO_SPLIT,
        strip_headers=False,
    )
    md_chunks = md_splitter.split_text(content)

    # 检测是否有实际标题层级（无标题时 splitter 返回一个整块且无 header metadata）
    has_headers = any(
        k in chunk.metadata
        for chunk in md_chunks
        for k in ["h1", "h2", "h3", "h4"]
    )

    # 2. 无标题 → 纯文本 fallback
    if not has_headers:
        remaining, tables = _extract_tables(content)
        chunks = _splitter().split_documents(
            [LCDocument(page_content=remaining, metadata={"source": filename})]
        )
        # 上下文富化
        for chunk in chunks:
            chunk.page_content = f"文档: {filename}\n\n{chunk.page_content}"
        # 表格独立 chunks
        for t_idx, table_text in enumerate(tables):
            chunks.append(
                LCDocument(
                    page_content=f"文档: {filename}\n\n{table_text.strip()}",
                    metadata={
                        "source": filename,
                        "is_table": True,
                        "table_index": t_idx,
                    },
                )
            )
        return chunks

    # 3. 标题感知 → 每个 section 作为独立切分单元
    result: list[LCDocument] = []
    for chunk in md_chunks:
        ctx = _build_context(filename, chunk.metadata)

        if len(chunk.page_content) <= CHUNK_SIZE:
            # 大小合适，直接加入
            chunk.page_content = f"{ctx}\n\n{chunk.page_content}"
            chunk.metadata["source"] = filename
            result.append(chunk)
        else:
            # 超长 section → 二次切分（保护表格）
            result.extend(
                _split_oversized(
                    chunk.page_content, filename, ctx, chunk.metadata
                )
            )

    return result


# ── KB CRUD ──

def create_kb(session: Session, user_id: int, name: str) -> KnowledgeBase:
    existing = session.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.user_id == user_id,
            KnowledgeBase.name == name,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="同名知识库已存在")

    kb = KnowledgeBase(user_id=user_id, name=name)
    session.add(kb)
    session.commit()
    session.refresh(kb)
    return kb


def list_kbs(
    session: Session, user_id: int, page: int = 1, page_size: int = 20
) -> list[dict]:
    offset = (page - 1) * page_size
    result = session.execute(
        select(KnowledgeBase)
        .where(KnowledgeBase.user_id == user_id)
        .order_by(KnowledgeBase.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    kbs = result.scalars().all()
    return [
        {
            "id": kb.id,
            "name": kb.name,
            "document_count": len(kb.documents),
            "created_at": kb.created_at,
        }
        for kb in kbs
    ]


def list_kbs_with_docs(
    session: Session, user_id: int, page: int = 1, page_size: int = 20
) -> list[dict]:
    offset = (page - 1) * page_size
    result = session.execute(
        select(KnowledgeBase)
        .where(KnowledgeBase.user_id == user_id)
        .order_by(KnowledgeBase.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    kbs = result.scalars().all()
    return [
        {
            "id": kb.id,
            "name": kb.name,
            "document_count": len(kb.documents),
            "created_at": kb.created_at,
            "documents": [
                {
                    "id": d.id,
                    "filename": d.filename,
                    "chunk_count": d.chunk_count,
                    "status": d.status,
                    "error_message": d.error_message,
                    "created_at": d.created_at,
                    "updated_at": d.updated_at,
                }
                for d in kb.documents
            ],
        }
        for kb in kbs
    ]


def count_kbs(session: Session, user_id: int) -> int:
    """Count total knowledge bases for a user"""
    from sqlalchemy import func

    result = session.execute(
        select(func.count(KnowledgeBase.id)).where(KnowledgeBase.user_id == user_id)
    )
    return result.scalar() or 0


def _get_kb(session: Session, kb_id: int, user_id: int) -> KnowledgeBase:
    result = session.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if kb.user_id != user_id:
        raise HTTPException(status_code=403, detail="无权操作此知识库")
    return kb


def rename_kb(session: Session, kb_id: int, user_id: int, name: str) -> KnowledgeBase:
    kb = _get_kb(session, kb_id, user_id)

    dup = session.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.user_id == user_id,
            KnowledgeBase.name == name,
            KnowledgeBase.id != kb_id,
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="同名知识库已存在")

    kb.name = name
    session.commit()
    session.refresh(kb)
    return kb


def delete_kb(session: Session, kb_id: int, user_id: int) -> int:
    kb = _get_kb(session, kb_id, user_id)
    doc_count = len(kb.documents)
    # 先删 Qdrant，失败了 SQL 可回滚
    delete_collection(kb_id)
    session.delete(kb)
    session.commit()
    return doc_count


# ── Document CRUD ──

def add_document(
    session: Session, kb_id: int, user_id: int, content: str, filename: str
) -> Document:
    _get_kb(session, kb_id, user_id)  # 校验所有权

    existing = session.execute(
        select(Document).where(
            Document.kb_id == kb_id,
            Document.filename == filename,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="知识库中已存在同名文档")

    doc = Document(kb_id=kb_id, filename=filename)
    session.add(doc)
    session.flush()  # 获取 doc.id

    # Ingest to Qdrant — if this fails, rollback SQL
    try:
        chunk_count = _ingest_to_kb(content, filename, kb_id, doc.id)
    except Exception:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail="向量化文档失败，请稍后重试",
        )

    doc.chunk_count = chunk_count
    doc.status = "ready"
    doc.error_message = None
    session.commit()
    session.refresh(doc)
    _invalidate_bm25_cache(kb_id)
    return doc


def list_documents(
    session: Session, kb_id: int, user_id: int, page: int = 1, page_size: int = 50
) -> list[Document]:
    _get_kb(session, kb_id, user_id)
    offset = (page - 1) * page_size
    result = session.execute(
        select(Document)
        .where(Document.kb_id == kb_id)
        .order_by(Document.created_at)
        .offset(offset)
        .limit(page_size)
    )
    return list(result.scalars().all())


def get_document(session: Session, kb_id: int, doc_id: int, user_id: int) -> Document:
    _get_kb(session, kb_id, user_id)
    result = session.execute(
        select(Document).where(Document.id == doc_id, Document.kb_id == kb_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return doc


def update_document(
    session: Session, kb_id: int, doc_id: int, user_id: int, content: str
) -> Document:
    doc = get_document(session, kb_id, doc_id, user_id)

    # upsert 自动覆盖同 ID chunk，无需手动删旧
    chunk_count = _ingest_to_kb(content, doc.filename, kb_id, doc_id)
    doc.chunk_count = chunk_count
    doc.status = "ready"
    doc.error_message = None
    doc.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(doc)
    _invalidate_bm25_cache(kb_id)
    return doc


def rename_document(
    session: Session, kb_id: int, doc_id: int, user_id: int, filename: str
) -> Document:
    doc = get_document(session, kb_id, doc_id, user_id)

    # 检查同名冲突
    existing = session.execute(
        select(Document).where(
            Document.kb_id == kb_id,
            Document.filename == filename,
            Document.id != doc_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="知识库中已存在同名文档")

    doc.filename = filename
    doc.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(doc)
    return doc


def delete_document(session: Session, kb_id: int, doc_id: int, user_id: int) -> None:
    doc = get_document(session, kb_id, doc_id, user_id)
    # SQL 先删，Qdrant 后清理（清理失败不阻塞，孤儿由定期任务兜底）
    session.delete(doc)
    session.commit()
    _invalidate_bm25_cache(kb_id)
    try:
        delete_document_chunks(kb_id, doc_id)
    except Exception:
        pass  # 残留 chunk 不影响正确性，定期清理兜底


# ── Internal ──

def _ingest_to_kb(
    content: str,
    filename: str,
    kb_id: int,
    doc_id: int,
    on_progress=None,
) -> int:
    """文档向量化存入 Qdrant（幂等 upsert + 确定性 ID）

    on_progress(progress: int, message: str) — 可选的进度回调（用于 ARQ worker）
    """
    import logging

    _logger = logging.getLogger(__name__)

    # ① 切分
    if on_progress:
        on_progress(10, "正在切分文档…")
    all_chunks = _split_content(content, filename)

    for i, chunk in enumerate(all_chunks):
        chunk.metadata["kb_id"] = kb_id
        chunk.metadata["document_id"] = doc_id
        chunk.metadata["document_name"] = filename
        chunk.metadata["chunk_index"] = i

    # ② Embedding + 存储（分批向量化，避免大文档 OOM 且进度可感知）
    if on_progress:
        on_progress(30, f"正在向量化 {len(all_chunks)} 个分块…")
    vs = get_vectorstore(kb_id)
    id_mult = 1_000_000
    chunk_ids = [doc_id * id_mult + i for i in range(len(all_chunks))]

    import time as _time

    from app.core.config import EMBEDDING_BATCH_SIZE

    total = len(all_chunks)
    for batch_start in range(0, total, EMBEDDING_BATCH_SIZE):
        batch_end = min(batch_start + EMBEDDING_BATCH_SIZE, total)
        batch_chunks = all_chunks[batch_start:batch_end]
        batch_ids = chunk_ids[batch_start:batch_end]
        # add_documents(ids=...) — 同 ID 自动覆盖（upsert 语义）
        # 带限流重试：API embedding 可能触发 429
        for attempt in range(5):
            try:
                vs.add_documents(batch_chunks, ids=batch_ids)
                break
            except Exception as e:
                msg = str(e)
                if "429" in msg or "rate" in msg.lower():
                    wait = 2 ** attempt  # 1, 2, 4, 8, 16s 指数退避
                    _logger.warning(
                        "Rate limited on batch %d/%d, retry in %ds (attempt %d)",
                        batch_end, total, wait, attempt + 1,
                    )
                    if on_progress:
                        on_progress(
                            30 + int(30 * batch_start / total),
                            f"限流等待 {wait}s… ({batch_end}/{total})",
                        )
                    _time.sleep(wait)
                else:
                    raise
        else:
            raise RuntimeError(
                f"Embedding batch {batch_start}-{batch_end} failed after 5 retries"
            )
        if on_progress:
            pct = 30 + int(30 * batch_end / total)
            on_progress(pct, f"正在向量化 {batch_end}/{total}…")
        # 批次间小延迟，避免触发限流
        _time.sleep(0.5)

    if on_progress:
        on_progress(80, "正在清理旧版本…")
    # 清理上一版本残留的旧 chunk（chunk 数减少时）
    try:
        from qdrant_client import models as qdrant_models

        client = vs.client
        col = f"kb_{kb_id}"
        current_ids = set(chunk_ids)
        stale_ids = []

        offset: int | str | None = None
        while True:
            pts, nxt = client.scroll(
                col, limit=1000, offset=offset,
                with_payload=False, with_vectors=False,
            )
            if not pts:
                break
            for p in pts:
                pid = int(p.id) if not isinstance(p.id, str) else 0
                if pid >= doc_id * id_mult and pid < (doc_id + 1) * id_mult:
                    if pid not in current_ids:
                        stale_ids.append(pid)
            offset = nxt  # type: ignore[assignment]
            if not nxt:
                break

        if stale_ids:
            client.delete(
                col,
                points_selector=qdrant_models.PointIdsList(points=stale_ids),  # type: ignore[arg-type]
            )
            _logger.info("Cleaned %d stale chunks for doc %d", len(stale_ids), doc_id)
    except Exception:
        _logger.warning("Failed to clean stale chunks for doc %d", doc_id, exc_info=True)

    return len(all_chunks)
