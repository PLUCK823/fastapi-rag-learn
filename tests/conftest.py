"""测试基础设施"""

import os
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

_project_root = Path(__file__).parent.parent
sys.path.insert(0, str(_project_root))

_test_db_path = _project_root / "test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_test_db_path}"
os.environ["SECRET_KEY"] = "test-secret-key-for-jwt-signing-must-be-at-least-32-bytes"


@pytest.fixture
async def client() -> AsyncClient:
    from app.core.database import Base, engine
    from app.main import app

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    """注册用户并登录，返回带 token 的 headers"""
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
