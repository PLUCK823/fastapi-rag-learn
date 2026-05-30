"""测试基础设施 — PostgreSQL 测试数据库 + 表级隔离"""

import os
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

_project_root = Path(__file__).parent.parent
sys.path.insert(0, str(_project_root))

# 使用独立测试数据库，不污染开发/生产数据
# 仅当环境变量未设置时才用本地默认值（CI 等环境会通过 env 传入）
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://raguser:devpassword@localhost:5432/raglearn_test",
)
os.environ.setdefault(
    "SECRET_KEY", "test-secret-key-for-jwt-signing-must-be-at-least-32-bytes"
)


@pytest.fixture
async def client() -> AsyncClient:
    """每个测试函数独立建表/删表，保证隔离"""
    from app.core.database import Base, async_engine, sync_engine
    from app.models.chat import ChatMessage  # noqa: F401
    from app.models.knowledge_base import Document, KnowledgeBase  # noqa: F401
    from app.models.user import User  # noqa: F401

    # 删除旧表 → 重建（确保每个测试从干净状态开始）
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    Base.metadata.create_all(sync_engine)

    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    # 清理
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    email = "test@example.com"
    password = "testpass123"

    resp = await client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 201, f"Register failed: {resp.text}"

    resp = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def kb_id(client: AsyncClient, auth_headers: dict) -> int:
    """创建一个测试知识库并返回其 id"""
    resp = await client.post("/kb", json={"name": "测试知识库"}, headers=auth_headers)
    assert resp.status_code == 200
    return resp.json()["id"]


@pytest.fixture
def mock_engine():
    """替换 engine 模块的 LLM 和 Embedding 为假实现，不加载真实模型。
    需要测试真实 LLM/Embedding 行为时，不引入此 fixture。
    """
    from tests.mocks import mock_engine_init

    with mock_engine_init():
        yield
