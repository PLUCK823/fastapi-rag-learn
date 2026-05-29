"""认证 + 个人中心 + 令牌刷新测试"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_profile(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert "id" in data


@pytest.mark.asyncio
async def test_update_nickname(client: AsyncClient, auth_headers: dict):
    resp = await client.put(
        "/auth/me", json={"nickname": "小明"}, headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nickname"] == "小明"

    # Verify persisted
    resp = await client.get("/auth/me", headers=auth_headers)
    assert resp.json()["nickname"] == "小明"


@pytest.mark.asyncio
async def test_update_nickname_empty_is_none(client: AsyncClient, auth_headers: dict):
    resp = await client.put(
        "/auth/me", json={"nickname": "   "}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["nickname"] is None


@pytest.mark.asyncio
async def test_change_password(client: AsyncClient, auth_headers: dict):
    resp = await client.put(
        "/auth/me/password",
        json={"old_password": "testpass123", "new_password": "newpass456"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "密码已修改"


@pytest.mark.asyncio
async def test_change_password_wrong_old(client: AsyncClient, auth_headers: dict):
    resp = await client.put(
        "/auth/me/password",
        json={"old_password": "wrongpassword", "new_password": "newpass456"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/auth/refresh", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] > 0

    # Old token should still work (not revoked)
    resp2 = await client.get("/auth/me", headers=auth_headers)
    assert resp2.status_code == 200


@pytest.mark.asyncio
async def test_refresh_without_token_fails(client: AsyncClient):
    resp = await client.post("/auth/refresh")
    assert resp.status_code == 401
