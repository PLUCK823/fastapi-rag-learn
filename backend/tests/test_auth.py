"""认证相关测试"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    email = "user1@test.com"
    password = "securepass123"

    resp = await client.post("/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == email
    assert "id" in data

    resp = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert resp.status_code == 200
    token_data = resp.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_ask_without_token_returns_401(client: AsyncClient):
    resp = await client.post("/ask", json={"kb_id": 1, "text": "什么是 Python？"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ask_with_token_returns_200(client: AsyncClient, auth_headers: dict, kb_id: int):
    resp = await client.post(
        "/ask",
        json={"kb_id": kb_id, "text": "什么是 Python？"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "question" in data
    assert "answer" in data
    assert "sources" in data


@pytest.mark.asyncio
async def test_register_duplicate_email_fails(client: AsyncClient):
    email = "dup@test.com"
    await client.post("/auth/register", json={"email": email, "password": "pass123456"})
    resp = await client.post("/auth/register", json={"email": email, "password": "pass123456"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login_wrong_password_fails(client: AsyncClient):
    email = "wrongpass@test.com"
    await client.post("/auth/register", json={"email": email, "password": "rightpass123"})
    resp = await client.post(
        "/auth/login",
        data={"username": email, "password": "wrongpassword"},
    )
    assert resp.status_code == 400
