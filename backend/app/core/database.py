"""SQLAlchemy engine + session factory（支持 SQLite / PostgreSQL 自动切换）"""

from collections.abc import AsyncGenerator, Generator

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import DATABASE_URL, IS_POSTGRES

# ── Engine 配置 ────────────────────────────────────────────────

_engine_kwargs: dict = {"echo": False}

if IS_POSTGRES:
    # PostgreSQL 连接池
    _engine_kwargs.update({
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
    })

# async engine（fastapi-users + 未来统一用 async）
async_engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
async_session_factory = async_sessionmaker(async_engine, expire_on_commit=False)

# sync engine（应用 CRUD 兼容层）
if IS_POSTGRES:
    # asyncpg → psycopg2
    _sync_url = DATABASE_URL.replace("+asyncpg", "+psycopg2")
else:
    # aiosqlite → sqlite
    _sync_url = DATABASE_URL.replace("+aiosqlite", "")

sync_engine = create_engine(_sync_url, echo=False, pool_pre_ping=True)
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
