"""SQLAlchemy engine + session factory（async 用于 auth，sync 用于应用 CRUD）"""

from collections.abc import AsyncGenerator, Generator

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import DATABASE_URL

# async engine（fastapi-users 需要）
async_engine = create_async_engine(DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(async_engine, expire_on_commit=False)

# sync engine（应用 CRUD 用，避免 greenlet 问题）
_sync_url = DATABASE_URL.replace("+aiosqlite", "")
sync_engine = create_engine(_sync_url, echo=False)
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
