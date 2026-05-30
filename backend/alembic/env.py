"""Alembic 迁移环境 — 支持 SQLite / PostgreSQL"""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# 导入所有模型，确保 Base.metadata 包含完整表结构
from app.core.config import DATABASE_URL, IS_POSTGRES
from app.core.database import Base
from app.models.chat import ChatMessage  # noqa: F401
from app.models.knowledge_base import Document, KnowledgeBase  # noqa: F401
from app.models.user import User  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 将 async URL 转为 sync URL（Alembic 使用同步引擎）
if IS_POSTGRES:
    _sync_url = DATABASE_URL.replace("+asyncpg", "+psycopg2")
else:
    _sync_url = DATABASE_URL.replace("+aiosqlite", "")

config.set_main_option("sqlalchemy.url", _sync_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        url=config.get_main_option("sqlalchemy.url"),
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
