import logging
import os as _os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.knowledge_base import router as kb_router
from app.api.routes import router
from app.core.config import CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS, CORS_ALLOW_ORIGINS
from app.core.rate_limit import RateLimitMiddleware

logger = logging.getLogger(__name__)

# backend/ 目录 = app/main.py 向上两级
_BACKEND_DIR = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))


def _run_migrations() -> None:
    """运行 Alembic 数据库迁移。
    兼容三种场景：
    1. 全新数据库 — 运行 upgrade 创建所有表
    2. 已有表但无版本记录（create_all） — stamp head 标记当前版本
    3. 已有版本记录 — upgrade 到最新版本
    """
    from sqlalchemy import inspect

    from app.core.database import sync_engine

    try:
        from alembic.config import Config

        from alembic import command  # noqa: F811
    except ImportError:
        logger.warning("Alembic not installed, skipping migrations")
        return

    alembic_ini = _os.path.join(_BACKEND_DIR, "alembic.ini")
    if not _os.path.exists(alembic_ini):
        logger.warning("alembic.ini not found at %s, skipping migrations", alembic_ini)
        return
    alembic_cfg = Config(alembic_ini)
    cwd = _os.getcwd()
    try:
        _os.chdir(_BACKEND_DIR)
        inspector = inspect(sync_engine)
        tables = inspector.get_table_names()
        has_version = "alembic_version" in tables
        has_data = len(tables) > 0

        if has_version:
            command.upgrade(alembic_cfg, "head")
            logger.info("Database migrations upgraded to head")
        elif has_data:
            command.stamp(alembic_cfg, "head")
            logger.info("Database stamped as head (tables already exist)")
        else:
            command.upgrade(alembic_cfg, "head")
            logger.info("Database migrations applied successfully")
    except Exception:
        logger.exception("Failed to apply database migrations")
        raise
    finally:
        _os.chdir(cwd)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 启动：运行数据库迁移
    _run_migrations()
    yield
    # 关闭：释放数据库连接池
    from app.core.database import async_engine, sync_engine

    await async_engine.dispose()
    sync_engine.dispose()
    logger.info("Database engines disposed")


app = FastAPI(title="RAG 学习项目", version="0.2.0", lifespan=lifespan)

# Rate limiting middleware (applied first, before CORS)
app.add_middleware(RateLimitMiddleware)

# CORS middleware for production deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=CORS_ALLOW_METHODS,
    allow_headers=CORS_ALLOW_HEADERS,
)

app.include_router(auth_router)
app.include_router(kb_router)
app.include_router(router)
