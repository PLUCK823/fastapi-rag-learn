import logging
import os as _os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.knowledge_base import router as kb_router
from app.api.routes import router
from app.core.config import CORS_ALLOW_HEADERS, CORS_ALLOW_METHODS, CORS_ALLOW_ORIGINS
from app.core.rate_limit import RateLimitMiddleware
from app.core.redis import create_redis_pool

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
    # 启动：Redis 连接池（用于入队 ARQ 任务）
    # 注：数据库迁移通过 CI pre-start 或 Docker entrypoint 执行，不在此处阻塞
    logger.info("Lifespan: attempting Redis connection...")
    try:
        redis_pool = await create_redis_pool()
        _app.state.redis = redis_pool
        logger.info("Redis pool created")
    except Exception:
        logger.warning("Redis unavailable — async tasks disabled")
        _app.state.redis = None
    logger.info("Lifespan: startup complete")

    yield

    # 测试环境不销毁 engine（conftest 自己管理 engine 生命周期）
    if _os.environ.get("PYTEST_RUNNING"):
        return
    # 关闭：释放数据库连接池
    from app.core.database import async_engine, sync_engine

    await async_engine.dispose()
    sync_engine.dispose()

    # 关闭 Redis
    if _app.state.redis:
        await _app.state.redis.close()
        logger.info("Redis pool closed")

    logger.info("Database engines disposed")


app = FastAPI(title="RAG 学习项目", version="0.2.0", lifespan=lifespan)


# ── Token 脱敏中间件：防止 JWT 出现在 uvicorn 访问日志中 ──
@app.middleware("http")
async def sanitize_token_logging(request: Request, call_next):
    """从 ASGI scope 中剥离 token 查询参数，避免出现在访问日志。"""
    qs = request.scope.get("query_string", b"")
    if b"token=" in qs:
        import re as _re
        sanitized = _re.sub(b"token=[^&]*", b"token=[REDACTED]", qs)
        request.scope["query_string"] = sanitized
    return await call_next(request)


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
