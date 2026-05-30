"""SQLAlchemy engine + session factory（PostgreSQL）"""

import os as _os
from collections.abc import AsyncGenerator, Generator

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import DATABASE_URL

# 测试环境使用 NullPool 避免连接池跨 event loop 污染
# （async tests 和 TestClient sync tests 使用不同的 event loop）
_testing = bool(_os.environ.get("PYTEST_RUNNING"))

# ── async engine（连接池）──────────────────────────────────

_async_kwargs: dict = {"echo": False, "pool_pre_ping": True}
if _testing:
    _async_kwargs["poolclass"] = NullPool
else:
    _async_kwargs.update({"pool_size": 10, "max_overflow": 20, "pool_recycle": 3600})

async_engine = create_async_engine(DATABASE_URL, **_async_kwargs)
async_session_factory = async_sessionmaker(async_engine, expire_on_commit=False)

# ── sync engine（应用 CRUD 兼容层，asyncpg → psycopg2）───

_sync_url = DATABASE_URL.replace("+asyncpg", "+psycopg2")

_sync_kwargs: dict = {"echo": False, "pool_pre_ping": True}
if _testing:
    _sync_kwargs["poolclass"] = NullPool

sync_engine = create_engine(_sync_url, **_sync_kwargs)
sync_session_factory = sessionmaker(sync_engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


def get_sync_session() -> Generator[Session, None, None]:
    with sync_session_factory() as session:
        yield session


SyncSessionDep = Depends(get_sync_session)
