"""ARQ Worker — 异步文档处理 + 批量操作 + 孤儿数据清理"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from arq import cron
from arq.connections import ArqRedis, RedisSettings

from app.core.config import REDIS_URL
from app.core.redis import update_task_progress

logger = logging.getLogger(__name__)

# 单文档处理硬超时（秒）— 防止 embedding/Qdrant 卡死阻塞 worker
INGEST_TIMEOUT = 120

# ── 文档向量化 ──


async def ingest_document(
    ctx: dict,
    kb_id: int,
    user_id: int,
    content: str,
    filename: str,
    doc_id: int,
) -> dict:
    """后台处理文档：切分 → 嵌入 → 存入 Qdrant"""
    from app.core.database import sync_session_factory
    from app.models.knowledge_base import Document
    from app.services.knowledge_base import _ingest_to_kb

    redis: ArqRedis = ctx["redis"]
    task_id = ctx.get("job_id", "unknown")

    try:
        await update_task_progress(redis, task_id, "chunking", 10, "正在切分文档…")

        # _ingest_to_kb 是同步 CPU 密集型调用（HuggingFace embedding），
        # 必须在独立线程中执行，否则会阻塞 ARQ 事件循环导致 job 超时重试
        chunk_count = await asyncio.wait_for(
            asyncio.to_thread(_ingest_to_kb, content, filename, kb_id, doc_id),
            timeout=INGEST_TIMEOUT,
        )

        await update_task_progress(redis, task_id, "storing", 80, "正在保存…")

        # 更新 SQL 中的 document 记录
        with sync_session_factory() as session:
            from sqlalchemy import update

            session.execute(
                update(Document).where(
                    Document.id == doc_id,
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

    except TimeoutError:
        logger.error(
            "Document ingestion TIMEOUT for %s (doc %d) in kb %d after %ds",
            filename, doc_id, kb_id, INGEST_TIMEOUT,
        )
        with sync_session_factory() as session:
            from sqlalchemy import update

            session.execute(
                update(Document).where(
                    Document.id == doc_id,
                    Document.status == "processing",
                ).values(
                    status="failed",
                    error_message=f"处理超时（超过 {INGEST_TIMEOUT} 秒），请重试",
                    updated_at=datetime.now(UTC),
                )
            )
            session.commit()
        await update_task_progress(
            redis, task_id, "failed", 0, f"处理超时（超过 {INGEST_TIMEOUT} 秒）"
        )
        raise

    except Exception as e:
        logger.exception(
            "Document ingestion failed for %s (doc %d) in kb %d",
            filename, doc_id, kb_id,
        )
        # 标记失败（用 doc_id 精准定位，避免更名后匹配不到）
        with sync_session_factory() as session:
            from sqlalchemy import update

            session.execute(
                update(Document).where(
                    Document.id == doc_id,
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


# ── 定期清理孤儿数据 ──


async def cleanup_orphan_data(ctx: dict) -> dict:
    """清理 SQL 与 Qdrant 不一致的孤儿数据

    场景：
    - 文档已从 SQL 删除，但 Qdrant chunk 残留（kill -9 等极端情况）
    - Worker 崩溃导致 status="processing" 超时未更新
    """
    from datetime import timedelta

    from app.core.database import sync_session_factory
    from app.models.knowledge_base import Document

    logger.info("Starting orphan cleanup...")

    result = {"stuck_docs_cleaned": 0, "orphan_chunks_cleaned": 0}  # type: ignore[dict-assignment]

    with sync_session_factory() as session:
        from sqlalchemy import select

        # 清理超过 1 小时仍卡在 processing 的文档
        stuck_docs = session.execute(
            select(Document).where(
                Document.status == "processing",
                Document.created_at < datetime.now(UTC) - timedelta(hours=1),
            )
        ).scalars().all()

        for doc in stuck_docs:
            try:
                from app.core.engine import delete_document_chunks

                delete_document_chunks(doc.kb_id, doc.id)
                session.delete(doc)
                result["stuck_docs_cleaned"] += 1  # type: ignore[index]
            except Exception as exc:
                logger.warning("Failed to clean stuck doc %d: %s", doc.id, exc)

        session.commit()

    logger.info(
        "Orphan cleanup done: %d stuck docs",
        result["stuck_docs_cleaned"],  # type: ignore[index]
    )
    return result


# 注册为每天凌晨 3 点的 cron 任务
cleanup_orphan_data = cron(  # type: ignore[assignment]
    cleanup_orphan_data, hour=3, minute=0, run_at_startup=False
)


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
    cron_jobs = [
        cleanup_orphan_data,  # type: ignore[list-item]
    ]
    max_jobs = 10
    job_timeout = 600  # 单任务最长 10 分钟
    keep_result = 3600  # 结果保留 1 小时
    health_check_interval = 30

    async def on_startup(self) -> None:
        logger.info("ARQ Worker started")

    async def on_shutdown(self) -> None:
        logger.info("ARQ Worker stopped")
