"""ARQ Worker — 异步文档处理 + 批量操作"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from arq.connections import ArqRedis, RedisSettings

from app.core.config import REDIS_URL
from app.core.redis import update_task_progress

logger = logging.getLogger(__name__)

# ── 文档向量化 ──


async def ingest_document(
    ctx: dict,
    kb_id: int,
    user_id: int,
    content: str,
    filename: str,
) -> dict:
    """后台处理文档：切分 → 嵌入 → 存入 ChromaDB"""
    from app.core.database import sync_session_factory
    from app.models.knowledge_base import Document
    from app.services.knowledge_base import _ingest_to_kb

    redis: ArqRedis = ctx["redis"]
    task_id = ctx.get("job_id", "unknown")

    try:
        await update_task_progress(redis, task_id, "chunking", 10, "正在切分文档…")

        chunk_count = _ingest_to_kb(content, filename, kb_id, 0)  # doc_id=0 临时
        # 注：_ingest_to_kb 内部会调用 vs.add_documents() 生成 embedding

        await update_task_progress(redis, task_id, "storing", 80, "正在保存…")

        # 更新 SQL 中的 document 记录
        with sync_session_factory() as session:
            from sqlalchemy import update

            session.execute(
                update(Document).where(
                    Document.kb_id == kb_id,
                    Document.filename == filename,
                    Document.status == "processing",
                ).values(
                    chunk_count=chunk_count,
                    status="ready",
                    updated_at=datetime.now(UTC),
                )
            )
            session.commit()

        await update_task_progress(redis, task_id, "done", 100, "处理完成")
        return {"kb_id": kb_id, "filename": filename, "chunk_count": chunk_count}

    except Exception as e:
        logger.exception("Document ingestion failed for %s in kb %d", filename, kb_id)
        # 标记失败
        with sync_session_factory() as session:
            from sqlalchemy import update

            session.execute(
                update(Document).where(
                    Document.kb_id == kb_id,
                    Document.filename == filename,
                    Document.status == "processing",
                ).values(
                    status="failed",
                    error_message=str(e)[:500],
                    updated_at=datetime.now(UTC),
                )
            )
            session.commit()

        await update_task_progress(redis, task_id, "failed", 0, str(e)[:200])
        raise


# ── 批量删除文档 ──


async def batch_delete_documents(
    ctx: dict,
    kb_id: int,
    user_id: int,
    doc_ids: list[int],
) -> dict:
    """后台批量删除文档"""
    redis: ArqRedis = ctx["redis"]
    task_id = ctx.get("job_id", "unknown")

    try:
        from sqlalchemy import select

        from app.core.database import sync_session_factory
        from app.core.engine import delete_document_chunks
        from app.models.knowledge_base import Document

        await update_task_progress(
            redis, task_id, "processing", 10,
            f"正在删除 {len(doc_ids)} 篇文档…",
        )

        with sync_session_factory() as session:
            docs = session.execute(
                select(Document).where(
                    Document.kb_id == kb_id,
                    Document.id.in_(doc_ids),
                )
            ).scalars().all()

            deleted = 0
            for i, doc in enumerate(docs):
                try:
                    delete_document_chunks(kb_id, doc.id)
                    session.delete(doc)
                    deleted += 1
                except Exception as exc:
                    logger.warning("Failed to delete doc %d: %s", doc.id, exc)
                progress = 10 + int((i + 1) / len(docs) * 85)
                await update_task_progress(
                    redis, task_id, "processing", progress, f"已删除 {deleted}/{len(docs)}"
                )

            session.commit()

        await update_task_progress(redis, task_id, "done", 100, f"成功删除 {deleted} 篇")
        return {"deleted_count": deleted, "total": len(doc_ids)}

    except Exception as e:
        logger.exception("Batch delete failed for kb %d", kb_id)
        await update_task_progress(redis, task_id, "failed", 0, str(e)[:200])
        raise


# ── Worker 配置 ──


def _redis_settings() -> RedisSettings:
    url = REDIS_URL.replace("redis://", "")
    if ":" in url:
        host, port_str = url.split(":", 1)
        port = int(port_str)
    else:
        host = url
        port = 6379
    return RedisSettings(host=host, port=port)


class WorkerSettings:
    """ARQ Worker 配置

    启动方式: arq app.core.worker.WorkerSettings
    """

    redis_settings = _redis_settings()
    functions = [
        ingest_document,
        batch_delete_documents,
    ]
    max_jobs = 10
    job_timeout = 600  # 单任务最长 10 分钟
    keep_result = 3600  # 结果保留 1 小时
    health_check_interval = 30

    async def on_startup(self) -> None:
        logger.info("ARQ Worker started")

    async def on_shutdown(self) -> None:
        logger.info("ARQ Worker stopped")
