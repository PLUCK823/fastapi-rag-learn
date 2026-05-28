"""知识库 CRUD + 文档管理（同步 SQLAlchemy，避免 greenlet）"""

from datetime import UTC, datetime

from fastapi import HTTPException
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import CHUNK_OVERLAP, CHUNK_SIZE
from app.core.engine import delete_collection, delete_document_chunks, get_vectorstore
from app.models.knowledge_base import Document, KnowledgeBase


def _splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", "。", ".", " "],
    )


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


def list_kbs(session: Session, user_id: int) -> list[dict]:
    result = session.execute(
        select(KnowledgeBase).where(KnowledgeBase.user_id == user_id)
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


def list_kbs_with_docs(session: Session, user_id: int) -> list[dict]:
    result = session.execute(
        select(KnowledgeBase).where(KnowledgeBase.user_id == user_id)
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
                    "created_at": d.created_at,
                    "updated_at": d.updated_at,
                }
                for d in kb.documents
            ],
        }
        for kb in kbs
    ]


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
    session.delete(kb)
    session.commit()
    delete_collection(kb_id)
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
    session.flush()

    chunk_count = _ingest_to_kb(content, filename, kb_id, doc.id)
    doc.chunk_count = chunk_count
    session.commit()
    session.refresh(doc)
    return doc


def list_documents(session: Session, kb_id: int, user_id: int) -> list[Document]:
    _get_kb(session, kb_id, user_id)
    result = session.execute(
        select(Document).where(Document.kb_id == kb_id).order_by(Document.created_at)
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

    delete_document_chunks(kb_id, doc_id)
    chunk_count = _ingest_to_kb(content, doc.filename, kb_id, doc_id)
    doc.chunk_count = chunk_count
    doc.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(doc)
    return doc


def delete_document(session: Session, kb_id: int, doc_id: int, user_id: int) -> None:
    doc = get_document(session, kb_id, doc_id, user_id)
    delete_document_chunks(kb_id, doc_id)
    session.delete(doc)
    session.commit()


# ── Internal ──

def _ingest_to_kb(content: str, filename: str, kb_id: int, doc_id: int) -> int:
    lc_doc = LCDocument(page_content=content, metadata={"source": filename})
    chunks = _splitter().split_documents([lc_doc])

    for i, chunk in enumerate(chunks):
        chunk.metadata["kb_id"] = kb_id
        chunk.metadata["document_id"] = doc_id
        chunk.metadata["document_name"] = filename
        chunk.metadata["chunk_index"] = i

    vs = get_vectorstore(kb_id)
    vs.add_documents(chunks)
    return len(chunks)
